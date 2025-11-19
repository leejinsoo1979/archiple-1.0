import { create } from 'zustand';

interface ExportStore {
  isExporting: boolean;
  exportType: 'link' | 'exe' | null;
  exportUrl: string | null;
  setExporting: (isExporting: boolean) => void;
  setExportType: (type: 'link' | 'exe' | null) => void;
  setExportUrl: (url: string | null) => void;
  resetExport: () => void;
}

export const useExportStore = create<ExportStore>((set) => ({
  isExporting: false,
  exportType: null,
  exportUrl: null,
  setExporting: (isExporting) => set({ isExporting }),
  setExportType: (exportType) => set({ exportType }),
  setExportUrl: (exportUrl) => set({ exportUrl }),
  resetExport: () => set({ isExporting: false, exportType: null, exportUrl: null }),
}));
