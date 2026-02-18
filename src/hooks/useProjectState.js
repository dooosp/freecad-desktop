import { useState, useEffect, useCallback } from 'react';

const DEFAULT_SETTINGS = {
  process: 'machining',
  material: 'SS304',
  standard: 'KS',
  batch: 100,
};

export function useProjectState({ backend, activeProfile, setActiveProfile }) {
  const [configPath, setConfigPath] = useState(null);
  const [examples, setExamples] = useState([]);
  const [results, setResults] = useState(null);
  const [stepImportData, setStepImportData] = useState(null);
  const [viewerTab, setViewerTab] = useState('3d');
  const [analysisTab, setAnalysisTab] = useState('dfm');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [projectName, setProjectName] = useState(null);
  const [rerunning, setRerunning] = useState(null);

  useEffect(() => {
    backend.getExamples()
      .then((ex) => {
        if (ex) setExamples(ex);
      })
      .catch(() => setExamples([]));
  }, [backend]);

  const restoreProject = useCallback((projectData) => {
    if (projectData.config?.path) setConfigPath(projectData.config.path);
    if (projectData.settings) setSettings(projectData.settings);
    if (projectData.profile && setActiveProfile) setActiveProfile(projectData.profile);
    if (projectData.results) setResults(projectData.results);
    if (projectData.ui?.viewerTab) setViewerTab(projectData.ui.viewerTab);
    if (projectData.ui?.analysisTab) setAnalysisTab(projectData.ui.analysisTab);
    setProjectName(projectData.name || null);
  }, [setActiveProfile]);

  const handleFileSelect = useCallback(async (path, rawFile) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.fcstudio')) {
      try {
        const { projectData } = await backend.openProject(path);
        restoreProject(projectData);
      } catch {
        // error set by backend
      }
      return;
    }

    if (lower.endsWith('.step') || lower.endsWith('.stp')) {
      try {
        const input = rawFile?.path ? rawFile.path : (rawFile || path);
        const data = await backend.importStep(input);
        setStepImportData(data);
      } catch {
        // error set by backend
      }
      return;
    }

    setConfigPath(path);
    setResults(null);
  }, [backend, restoreProject]);

  const handleAnalyze = useCallback(async () => {
    if (!configPath) return;
    setResults(null);
    try {
      const data = await backend.analyze(configPath, {
        dfm: true,
        drawing: true,
        tolerance: true,
        cost: true,
        process: settings.process,
        material: settings.material,
        batch: settings.batch,
        standard: settings.standard,
        dxfExport: settings.dxfExport || false,
        profileName: activeProfile !== '_default' ? activeProfile : undefined,
      });
      setResults(data);
    } catch {
      // error already set in backend
    }
  }, [configPath, settings, activeProfile, backend]);

  const handleRerunStage = useCallback(async (stage) => {
    if (!configPath || !results) return;
    setRerunning(stage);
    backend.setError(null);

    try {
      const profileArg = activeProfile !== '_default' ? activeProfile : undefined;
      if (stage === 'dfm') {
        const data = await backend.runDfm(configPath, settings.process, profileArg, settings.standard);
        setResults((prev) => ({ ...prev, dfm: data }));
      } else if (stage === 'cost') {
        const data = await backend.runCost(configPath, {
          process: settings.process,
          material: settings.material,
          batchSize: settings.batch,
          dfmResult: results.dfm || null,
          profileName: profileArg,
          standard: settings.standard,
        });
        setResults((prev) => ({ ...prev, cost: data }));
      } else if (stage === 'drawing') {
        const data = await backend.runDrawing(configPath, undefined, settings.standard);
        setResults((prev) => ({
          ...prev,
          drawing: data,
          drawingSvg: data.svgContent || prev.drawingSvg,
          qa: data.qa || prev.qa,
        }));
      } else if (stage === 'tolerance') {
        const data = await backend.runTolerance(configPath, settings.standard);
        setResults((prev) => ({ ...prev, tolerance: data }));
      }
    } catch {
      // error set by backend
    } finally {
      setRerunning(null);
    }
  }, [configPath, results, settings, activeProfile, backend]);

  const handleUseStepConfig = useCallback((cfgPath) => {
    setConfigPath(cfgPath);
    setResults(null);
    setStepImportData(null);
  }, []);

  const handleSaveStepConfig = useCallback(async (cfgPath, tomlString) => {
    await backend.saveStepConfig(cfgPath, tomlString);
  }, [backend]);

  const handleSaveProject = useCallback(async () => {
    const name = projectName || (configPath ? configPath.replace(/.*\//, '').replace(/\.\w+$/, '') : 'untitled');
    const projectData = {
      name,
      created: new Date().toISOString(),
      config: configPath ? { path: configPath } : null,
      settings,
      profile: activeProfile,
      results: results || null,
      ui: { viewerTab, analysisTab },
    };

    try {
      await backend.saveProject(projectData);
      setProjectName(name);
      backend.setError(null);
    } catch {
      // error set by backend
    }
  }, [projectName, configPath, settings, activeProfile, results, viewerTab, analysisTab, backend]);

  const handleOpenProject = useCallback(async () => {
    try {
      const recent = await backend.getRecentProjects();
      if (!recent || recent.length === 0) {
        backend.setError('No recent projects found');
        return;
      }
      const { projectData } = await backend.openProject(recent[0].path);
      if (!projectData) {
        backend.setError('Project data is empty');
        return;
      }
      restoreProject(projectData);
    } catch {
      // error set by backend
    }
  }, [backend, restoreProject]);

  return {
    configPath,
    setConfigPath,
    examples,
    results,
    setResults,
    stepImportData,
    viewerTab,
    setViewerTab,
    analysisTab,
    settings,
    setSettings,
    rerunning,
    handleFileSelect,
    handleAnalyze,
    handleRerunStage,
    handleUseStepConfig,
    handleSaveStepConfig,
    handleSaveProject,
    handleOpenProject,
    setAnalysisTab,
    setStepImportData,
  };
}
