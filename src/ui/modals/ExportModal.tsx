import { useState } from 'react';
import { useExportStore } from '../../stores/exportStore';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import styles from './ExportModal.module.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  floorplanData: any;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, floorplanData }) => {
  const { setExporting, setExportType, setExportUrl } = useExportStore();
  const [loading, setLoading] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportAsLink = async () => {
    setLoading(true);
    setExporting(true);
    setExportType('link');

    try {
      // Serialize floorplan data to remove circular references
      const serializeData = (data: any) => {
        if (!data) {
          return {
            walls: [],
            points: [],
            rooms: [],
            doors: [],
            windows: [],
          };
        }

        // Extract only serializable data, excluding the floorplan object with circular refs
        return {
          points: data.points || [],
          walls: data.walls || [],
          rooms: data.rooms || [],
          doors: data.doors || [],
          windows: data.windows || [],
        };
      };

      const dataToExport = serializeData(floorplanData);

      console.log('[Export] Exporting data:', dataToExport);

      // Create a unique ID for this project
      const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store the floorplan data in localStorage with the project ID
      const exportData = {
        floorplanData: dataToExport,
        timestamp: new Date().toISOString(),
        mode: 'play', // Always export in play mode
      };

      // Save to Firestore
      try {
        const projectsRef = collection(db, 'projects');
        const projectDoc = doc(projectsRef, projectId);

        await setDoc(projectDoc, exportData);
        console.log('[Export] Successfully saved to Firestore');
      } catch (firebaseError) {
        console.error('[Export] Firebase error:', firebaseError);
        throw new Error(`Failed to save project data. ${firebaseError instanceof Error ? firebaseError.message : 'Unknown error'}`);
      }

      // Create the shareable URL
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/play/${projectId}`;

      console.log('[Export] Generated share URL:', shareUrl);

      setExportedUrl(shareUrl);
      setExportUrl(shareUrl);

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        console.log('[Export] Copied to clipboard');
      } catch (clipboardError) {
        console.warn('Clipboard copy failed, but export succeeded:', clipboardError);
        // Don't throw - export succeeded even if clipboard failed
      }
    } catch (error) {
      console.error('Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Export failed. Please try again.';
      alert(errorMessage);
      setExportedUrl(null);
    } finally {
      setLoading(false);
      setExporting(false);
    }
  };

  const handleExportAsExe = async () => {
    setLoading(true);
    setExporting(true);
    setExportType('exe');

    try {
      // For EXE export, we'll need to package the app with Electron
      // This is a placeholder - actual implementation would require a backend service
      alert('EXE export feature is coming soon! This will package your project as a standalone desktop application.');

      // TODO: Implement actual EXE export with Electron
      // This would involve:
      // 1. Sending the floorplan data to a backend service
      // 2. Backend packages the app with Electron
      // 3. Returns a download link for the .exe file
    } catch (error) {
      console.error('EXE export failed:', error);
      alert('EXE export failed. Please try again.');
    } finally {
      setLoading(false);
      setExporting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (exportedUrl) {
      await navigator.clipboard.writeText(exportedUrl);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Export Project</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {exportedUrl ? (
            <div className={styles.successSection}>
              <div className={styles.successIcon}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3 className={styles.successTitle}>Export Successful!</h3>
              <p className={styles.successDescription}>
                Your interactive play mode has been exported and is ready to share.
              </p>
              <div className={styles.urlContainer}>
                <input
                  type="text"
                  className={styles.urlInput}
                  value={exportedUrl}
                  readOnly
                />
                <button className={styles.copyBtn} onClick={handleCopyUrl}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </button>
              </div>
              <button className={styles.doneBtn} onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <div className={styles.exportOptions}>
              <div className={styles.option} onClick={handleExportAsLink}>
                <div className={styles.optionIcon}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <div className={styles.optionContent}>
                  <h3 className={styles.optionTitle}>Export as Link</h3>
                  <p className={styles.optionDescription}>
                    Share your interactive 3D space with a web link
                  </p>
                </div>
                <div className={styles.optionArrow}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>

              <div className={styles.option} onClick={handleExportAsExe}>
                <div className={styles.optionIcon}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="14" x2="4" y2="14" />
                  </svg>
                </div>
                <div className={styles.optionContent}>
                  <h3 className={styles.optionTitle}>Export as EXE</h3>
                  <p className={styles.optionDescription}>
                    Download as a standalone desktop application
                  </p>
                  <span className={styles.comingSoon}>Coming Soon</span>
                </div>
                <div className={styles.optionArrow}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Exporting your project...</p>
          </div>
        )}
      </div>
    </>
  );
};
