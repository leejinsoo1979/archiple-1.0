import React, { useState } from 'react';
import { NanobananaService } from '../../../lib/nanobanana';
import styles from './AIRenderModal.module.css';

interface AIRenderModalProps {
    isOpen: boolean;
    onClose: () => void;
    themeMode: 'light' | 'dark';
    themeColor: string;
    initialImage?: string | null;
}

export const AIRenderModal: React.FC<AIRenderModalProps> = ({ isOpen, onClose, themeMode, themeColor, initialImage }) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAutoPrompting, setIsAutoPrompting] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3'>('1:1');
    const [stylePreset, setStylePreset] = useState('photorealistic');
    const [selectedModel, setSelectedModel] = useState<'nanobanana1' | 'nanobanana2'>('nanobanana2');

    if (!isOpen) return null;

    const handleGenerate = async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        setGeneratedImage(null);

        try {
            // Enhance prompt based on preset
            let enhancedPrompt = prompt;

            // Add specific instructions for Image-to-Image if image is present
            if (initialImage) {
                enhancedPrompt += " Maintain the EXACT layout, perspective, and scale of the provided reference image. Do not move walls or furniture. Apply the requested style while keeping the geometry identical.";
            }

            if (stylePreset === 'photorealistic') {
                enhancedPrompt += " [TRANSFORMATION INSTRUCTION] Transform this 3D blockout into a high-end architectural photograph. Replace the simple geometry and flat shading with realistic physical materials (PBR), global illumination, and ray-traced reflections. Keep the EXACT layout and perspective, but overhaul the textures to be indistinguishable from reality. Use a 24mm wide-angle lens, soft natural lighting, and add subtle imperfections for realism. 8k resolution, highly detailed.";
            } else if (stylePreset === 'sketch') {
                enhancedPrompt += " Architectural sketch, pencil drawing style, clean lines, white background.";
            } else if (stylePreset === 'watercolor') {
                enhancedPrompt += " Watercolor painting style, soft colors, artistic, wet-on-wet technique.";
            } else if (stylePreset === 'cyberpunk') {
                enhancedPrompt += " Cyberpunk style, neon lights, futuristic, high contrast, night scene.";
            }

            const imageBase64 = await NanobananaService.generateImage({
                prompt: enhancedPrompt,
                aspectRatio: aspectRatio,
                image: initialImage || undefined,
                model: selectedModel
            });
            setGeneratedImage(imageBase64);
        } catch (error) {
            console.error('Generation failed:', error);
            alert('Failed to generate image. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()} data-theme={themeMode}>
                <div className={styles.header}>
                    <h2>AI Rendering (Nanobanana)</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div className={styles.body}>
                    <div className={styles.mainContent}>
                        {/* Left Side: Controls */}
                        <div className={styles.controlsColumn}>
                            <div className={styles.inputSection}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ marginBottom: 0 }}>Prompt</label>
                                    <button
                                        className={styles.autoBtn}
                                        onClick={async () => {
                                            if (!initialImage) return;
                                            setIsAutoPrompting(true);
                                            try {
                                                const autoPrompt = await NanobananaService.describeImage(initialImage);
                                                setPrompt(autoPrompt);
                                            } catch (e) {
                                                console.error('Auto prompt failed:', e);
                                                alert('Failed to generate auto prompt.');
                                            } finally {
                                                setIsAutoPrompting(false);
                                            }
                                        }}
                                        disabled={isAutoPrompting || !initialImage}
                                        style={{
                                            fontSize: '12px',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid ' + themeColor,
                                            background: 'transparent',
                                            color: themeColor,
                                            cursor: 'pointer',
                                            opacity: (!initialImage || isAutoPrompting) ? 0.5 : 1
                                        }}
                                    >
                                        {isAutoPrompting ? 'Analyzing...' : '✨ Auto'}
                                    </button>
                                </div>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    placeholder="Describe the scene (e.g., 'Modern living room with warm lighting')..."
                                    rows={4}
                                    disabled={isAutoPrompting}
                                />
                            </div>

                            <div className={styles.optionsGrid}>
                                <div className={styles.optionGroup}>
                                    <label>Model</label>
                                    <select value={selectedModel} onChange={e => setSelectedModel(e.target.value as 'nanobanana1' | 'nanobanana2')}>
                                        <option value="nanobanana2">Nanobanana 2 (Imagen 3)</option>
                                        <option value="nanobanana1">Nanobanana 1 (Flash)</option>
                                    </select>
                                </div>
                                <div className={styles.optionGroup}>
                                    <label>Style</label>
                                    <select value={stylePreset} onChange={e => setStylePreset(e.target.value)}>
                                        <option value="photorealistic">Photorealistic</option>
                                        <option value="sketch">Sketch</option>
                                        <option value="watercolor">Watercolor</option>
                                        <option value="cyberpunk">Cyberpunk</option>
                                    </select>
                                </div>
                                <div className={styles.optionGroup}>
                                    <label>Aspect Ratio</label>
                                    <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as any)}>
                                        <option value="1:1">Square (1:1)</option>
                                        <option value="16:9">Landscape (16:9)</option>
                                        <option value="9:16">Portrait (9:16)</option>
                                        <option value="4:3">Standard (4:3)</option>
                                    </select>
                                </div>
                            </div>

                            {initialImage && (
                                <div className={styles.referenceImageSection}>
                                    <label>Reference View</label>
                                    <div className={styles.referenceImageContainer}>
                                        <img src={initialImage} alt="Reference View" />
                                        <span className={styles.referenceBadge}>Using 3D View</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Side: Preview */}
                        <div className={styles.previewColumn}>
                            <div className={styles.previewSection}>
                                {isGenerating ? (
                                    <div className={styles.loading}>
                                        <div className={styles.spinner} style={{ borderTopColor: themeColor }}></div>
                                        <p>Generating your masterpiece...</p>
                                    </div>
                                ) : generatedImage ? (
                                    <div className={styles.result}>
                                        <img src={generatedImage} alt="Generated Result" />
                                        <a href={generatedImage} download="ai-render.png" className={styles.downloadBtn} style={{ backgroundColor: themeColor }}>
                                            Download Image
                                        </a>
                                    </div>
                                ) : (
                                    <div className={styles.placeholder}>
                                        <p>Enter a prompt and click Generate to see the magic.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                    <button
                        className={styles.generateBtn}
                        onClick={handleGenerate}
                        disabled={isGenerating || !prompt.trim()}
                        style={{ backgroundColor: themeColor }}
                    >
                        {isGenerating ? 'Generating...' : 'Generate'}
                    </button>
                </div>
            </div>
        </div>
    );
};
