/**
 * Shared contracts for app-shell context and split layout/modal components.
 */

/**
 * @typedef {object} ProfileState
 * @property {Array<{name: string}>} profiles
 * @property {string} activeProfile
 * @property {object|null} activeProfileData
 * @property {object|null} editingProfile
 * @property {boolean} showProfileModal
 * @property {boolean} showCompareModal
 * @property {(name: string) => void} handleProfileChange
 * @property {() => Promise<void>} handleEditProfile
 * @property {() => void} handleNewProfile
 * @property {(profile: object) => Promise<void>} handleSaveProfile
 * @property {(name: string) => Promise<void>} handleDeleteProfile
 * @property {() => void} openCompareModal
 * @property {() => void} closeCompareModal
 * @property {() => void} closeProfileModal
 * @property {(name: string) => void} setActiveProfile
 */

/**
 * @typedef {object} ProjectState
 * @property {string|null} configPath
 * @property {string[]} examples
 * @property {object|null} results
 * @property {(next: object|null|((prev: object|null) => object|null)) => void} setResults
 * @property {object|null} stepImportData
 * @property {'3d'|'drawing'|'pdf'} viewerTab
 * @property {(tab: '3d'|'drawing'|'pdf') => void} setViewerTab
 * @property {'dfm'|'tolerance'|'cost'|'ai-design'|'fem'} analysisTab
 * @property {(tab: 'dfm'|'tolerance'|'cost'|'ai-design'|'fem') => void} setAnalysisTab
 * @property {object} settings
 * @property {(next: object) => void} setSettings
 * @property {string|null} rerunning
 * @property {(path: string, rawFile?: File|string) => Promise<void>} handleFileSelect
 * @property {() => Promise<void>} handleAnalyze
 * @property {(stage: 'dfm'|'tolerance'|'cost'|'drawing'|'ai-design'|'fem') => Promise<void>} handleRerunStage
 * @property {(path: string|null) => void} setConfigPath
 * @property {(cfgPath: string) => void} handleUseStepConfig
 * @property {(cfgPath: string, toml: string) => Promise<void>} handleSaveStepConfig
 * @property {() => Promise<void>} handleSaveProject
 * @property {() => Promise<void>} handleOpenProject
 * @property {(value: object|null) => void} setStepImportData
 */

/**
 * @typedef {object} ModalState
 * @property {boolean} showReportModal
 * @property {boolean} showTemplateEditor
 * @property {boolean} showExportModal
 * @property {string|null} lastTemplateName
 * @property {object|null} editingTemplate
 * @property {() => void} openReportModal
 * @property {() => void} closeReportModal
 * @property {(config: object) => Promise<void>} handleGenerateReport
 * @property {(name: string) => Promise<void>} handleEditTemplate
 * @property {() => void} handleNewTemplate
 * @property {(tpl: object) => Promise<void>} handleSaveTemplate
 * @property {(name: string) => Promise<void>} handleDeleteTemplate
 * @property {() => void} closeTemplateEditor
 * @property {() => void} openExportModal
 * @property {() => void} closeExportModal
 * @property {(options: object) => Promise<object>} handleExportPack
 */

/**
 * @typedef {object} AppShellContextValue
 * @property {object} backend
 * @property {ProfileState} profileState
 * @property {ProjectState} projectState
 * @property {ModalState} modalState
 */

export {};
