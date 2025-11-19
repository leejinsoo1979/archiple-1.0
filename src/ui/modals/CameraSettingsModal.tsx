import { useCameraSettingsStore } from '../../stores/cameraSettingsStore';
import styles from './CameraSettingsModal.module.css';

export const CameraSettingsModal: React.FC = () => {
  const {
    projectionType,
    autoExposure,
    exposure,
    horizontalFov,
    depthOfField,
    isModalOpen,
    setProjectionType,
    setAutoExposure,
    setExposure,
    setHorizontalFov,
    setDepthOfField,
    setModalOpen,
    resetToDefaults,
  } = useCameraSettingsStore();

  if (!isModalOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={() => setModalOpen(false)} />

      {/* Modal */}
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Camera Settings</h2>
          <button className={styles.closeBtn} onClick={() => setModalOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {/* Projection Type */}
          <div className={styles.setting}>
            <label className={styles.label}>Projection Type</label>
            <select
              className={styles.select}
              value={projectionType}
              onChange={(e) => setProjectionType(e.target.value as 'perspective' | 'orthographic')}
            >
              <option value="perspective">Perspective</option>
              <option value="orthographic">Orthographic</option>
            </select>
            <p className={styles.description}>
              Perspective for realistic view, Orthographic for architectural/technical view
            </p>
          </div>

          {/* Auto Exposure */}
          <div className={styles.setting}>
            <label className={styles.label}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={autoExposure}
                onChange={(e) => setAutoExposure(e.target.checked)}
              />
              <span className={styles.labelText}>Auto Exposure</span>
            </label>
            <p className={styles.description}>
              Automatically adjust brightness based on scene lighting
            </p>
          </div>

          {/* Exposure */}
          <div className={styles.setting}>
            <label className={styles.label}>
              Exposure
              <span className={styles.value}>{exposure}%</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="0"
              max="100"
              value={exposure}
              onChange={(e) => setExposure(Number(e.target.value))}
              disabled={autoExposure}
            />
            <p className={styles.description}>
              Manual brightness control (only when Auto Exposure is off)
            </p>
          </div>

          {/* Field of View */}
          <div className={styles.setting}>
            <label className={styles.label}>
              Field of View
              <span className={styles.value}>{horizontalFov}°</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="30"
              max="120"
              value={horizontalFov}
              onChange={(e) => setHorizontalFov(Number(e.target.value))}
            />
            <div className={styles.rangeLabels}>
              <span>30° (Narrow)</span>
              <span>120° (Wide)</span>
            </div>
            <p className={styles.description}>
              Wider FOV shows more area but may cause distortion
            </p>
          </div>

          {/* Depth of Field */}
          <div className={styles.setting}>
            <label className={styles.label}>
              Depth of Field
              <span className={styles.value}>{depthOfField}%</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="0"
              max="100"
              value={depthOfField}
              onChange={(e) => setDepthOfField(Number(e.target.value))}
            />
            <div className={styles.rangeLabels}>
              <span>Off</span>
              <span>Maximum Blur</span>
            </div>
            <p className={styles.description}>
              Creates cinematic focus effect by blurring distant objects
            </p>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.resetBtn} onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <button className={styles.applyBtn} onClick={() => setModalOpen(false)}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
};
