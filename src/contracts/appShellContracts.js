/**
 * App shell contracts used by split container/presentation components.
 * This keeps the prop API explicit while App.jsx stays thin.
 */

/**
 * @typedef {object} AppHeaderProps
 * @property {object} backend
 * @property {string|null} configPath
 * @property {object|null} results
 * @property {() => void} onOpenProject
 * @property {() => void} onSaveProject
 * @property {() => void} onAnalyze
 * @property {() => void} onOpenReportConfig
 * @property {() => void} onOpenExportPack
 */

/**
 * @typedef {object} AppMainLayoutProps
 * @property {object} backend
 * @property {Array<{name: string}>} profiles
 * @property {string} activeProfile
 * @property {object|null} activeProfileData
 * @property {(name: string) => void} onProfileChange
 * @property {() => void} onEditProfile
 * @property {() => void} onNewProfile
 * @property {() => void} onCompareProfiles
 * @property {(path: string, rawFile?: File|string) => void|Promise<void>} onFileSelect
 * @property {string[]} examples
 * @property {string|null} configPath
 * @property {object} settings
 * @property {(next: object) => void} onSettingsChange
 * @property {object|null} results
 * @property {'3d'|'drawing'|'pdf'} viewerTab
 * @property {(tab: '3d'|'drawing'|'pdf') => void} onViewerTabChange
 * @property {'dfm'|'tolerance'|'cost'} analysisTab
 * @property {(tab: 'dfm'|'tolerance'|'cost') => void} onAnalysisTabChange
 * @property {string|null} rerunning
 * @property {(stage: 'dfm'|'tolerance'|'cost'|'drawing') => void|Promise<void>} onRerunStage
 * @property {() => void} onOpenReportConfig
 */

/**
 * @typedef {object} AppModalsProps
 * @property {object} backend
 * @property {string|null} configPath
 * @property {object} settings
 * @property {Array<{name: string}>} profiles
 * @property {string} activeProfile
 * @property {string|null} lastTemplateName
 * @property {object|null} stepImportData
 * @property {(cfgPath: string) => void} onUseStepConfig
 * @property {(cfgPath: string, toml: string) => Promise<void>} onSaveStepConfig
 * @property {() => void} onCloseStepImport
 * @property {boolean} showProfileModal
 * @property {object|null} editingProfile
 * @property {(profile: object) => Promise<void>} onSaveProfile
 * @property {(name: string) => Promise<void>} onDeleteProfile
 * @property {() => void} onCloseProfileModal
 * @property {boolean} showReportModal
 * @property {(config: object) => Promise<void>} onGenerateReport
 * @property {() => void} onCloseReportModal
 * @property {(name: string) => Promise<void>} onEditTemplate
 * @property {() => void} onNewTemplate
 * @property {boolean} showTemplateEditor
 * @property {object|null} editingTemplate
 * @property {(tpl: object) => Promise<void>} onSaveTemplate
 * @property {(name: string) => Promise<void>} onDeleteTemplate
 * @property {() => void} onCloseTemplateEditor
 * @property {boolean} showCompareModal
 * @property {() => void} onCloseCompareModal
 * @property {boolean} showExportModal
 * @property {(options: object) => Promise<void>} onExportPack
 * @property {() => void} onCloseExportModal
 */

export {};
