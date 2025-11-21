import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
    console.error('CRITICAL: Missing VITE_GEMINI_API_KEY environment variable. AI features will not work.');
    throw new Error('Missing Google Gemini API Key. Please check your .env file.');
}

console.log('[Nanobanana] Initializing Gemini Service with key:', API_KEY.substring(0, 4) + '****');
const genAI = new GoogleGenerativeAI(API_KEY);

export interface GenerateImageOptions {
    prompt: string;
    negativePrompt?: string; // Gemini doesn't strictly support negative prompts in the same way as SD, but we can append to prompt
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    image?: string; // Base64 encoded image string (data:image/png;base64,...)
    model?: 'nanobanana1' | 'nanobanana2'; // Model selection: Nanobanana 1 (gemini-2.5-flash-image) or Nanobanana 2 (gemini-3-pro-image)
    generationConfig?: {
        temperature?: number;
        topP?: number;
        topK?: number;
        candidateCount?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
    };
}

export const NanobananaService = {
    /**
     * Generates an image based on a text prompt using Gemini.
     * Note: The current Gemini API for "generateContent" with image models usually returns text descriptions or analysis.
     * However, for the purpose of this "Nanobanana" feature as requested (which implies image generation),
     * we will assume we are using a model capable of image output or we are simulating it if the standard SDK
     * doesn't fully support direct image bytes return in this version yet.
     * 
     * Based on the user's provided docs (nanobanana.md), the model "gemini-2.5-flash-image" returns inline data.
     * Supports Image-to-Image if an image is provided in options.
     */
    generateImage: async (options: GenerateImageOptions): Promise<string> => {
        try {
            // Select model based on user choice
            const modelName = options.model === 'nanobanana1'
                ? 'gemini-2.5-flash-image'  // Nanobanana 1
                : 'gemini-3-pro-image';      // Nanobanana 2 (default)

            console.log('[Nanobanana] Using model:', modelName);

            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: options.generationConfig
            });

            // Construct prompt parts
            const promptParts: any[] = [{ text: options.prompt }];

            if (options.aspectRatio) {
                promptParts.push({ text: ` Aspect ratio: ${options.aspectRatio}.` });
            }

            // Add image if provided
            if (options.image) {
                // Extract base64 data and mime type
                // Expected format: data:image/png;base64,iVBORw0go...
                const matches = options.image.match(/^data:(.+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const data = matches[2];

                    promptParts.push({
                        inlineData: {
                            data: data,
                            mimeType: mimeType
                        }
                    });
                    console.log('[Nanobanana] Included reference image in request');
                } else {
                    console.error('[Nanobanana] Invalid image format provided:', options.image.substring(0, 50) + '...');
                    throw new Error('Invalid image format. Expected base64 string with data URI prefix.');
                }
            }

            console.log('[Nanobanana] Sending request with prompt:', options.prompt);

            // Based on the docs provided in nanobanana.md:
            // response.parts[].inlineData contains the image.

            const result = await model.generateContent(promptParts);
            const response = await result.response;

            // Check for inline data (image)
            // Note: The TypeScript types for the SDK might not fully reflect the "image generation" capability 
            // if it's a very new feature, so we might need some casting or careful checking.

            console.log('[Nanobanana] API Response:', JSON.stringify(response, null, 2));

            // In the provided docs:
            // for (const part of response.parts) { if (part.inlineData) { ... } }

            // We need to inspect the candidates/parts.
            const candidates = response.candidates;
            if (candidates && candidates.length > 0) {
                const parts = candidates[0].content.parts;
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        console.log('[Nanobanana] Image data found!');
                        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                }
            }

            // Fallback or Error if no image found
            console.warn('[Nanobanana] No image data found in Gemini response, checking for text...');
            const text = response.text();
            if (text) {
                console.log('[Nanobanana] Gemini returned text instead of image:', text);
                throw new Error('AI returned text instead of an image. Try refining the prompt.');
            }

            throw new Error('No content generated.');
        } catch (error) {
            console.error('[Nanobanana] Service Error:', error);
            throw error;
        }
    },

    /**
     * Analyzes an image and generates a detailed prompt for architectural rendering.
     */
    describeImage: async (imageBase64: string): Promise<string> => {
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image' });

            const matches = imageBase64.match(/^data:(.+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                throw new Error('Invalid image format');
            }

            const mimeType = matches[1];
            const data = matches[2];

            const prompt = "Analyze this architectural 3D view. Describe the scene in detail to be used as a prompt for a high-quality photorealistic render. Focus on the room layout, furniture style, lighting, materials, and overall atmosphere. Output ONLY the descriptive prompt, no conversational text.";

            const result = await model.generateContent([
                { text: prompt },
                {
                    inlineData: {
                        data: data,
                        mimeType: mimeType
                    }
                }
            ]);

            const response = await result.response;
            const text = response.text();

            if (!text) {
                throw new Error('Failed to generate description');
            }

            return text.trim();
        } catch (error) {
            console.error('[Nanobanana] Describe Image Error:', error);
            throw error;
        }
    }
};
