import React from 'react';
import FileDropZone from '../FileDropZone.jsx';
import SettingsPanel from '../SettingsPanel.jsx';
import ShopProfilePanel from '../ShopProfilePanel.jsx';
import { useAppShell } from '../../contexts/AppShellContext.jsx';

export default function AppSidebar() {
  const { backend, profileState, projectState } = useAppShell();

  return (
    <aside className="sidebar">
      <ShopProfilePanel
        profiles={profileState.profiles}
        activeProfile={profileState.activeProfile}
        activeProfileData={profileState.activeProfileData}
        onProfileChange={profileState.handleProfileChange}
        onEditProfile={profileState.handleEditProfile}
        onNewProfile={profileState.handleNewProfile}
        onCompareProfiles={profileState.openCompareModal}
      />

      <div className="sidebar-section">
        <h3>Files</h3>
        <FileDropZone onFileSelect={projectState.handleFileSelect} />
        {projectState.examples.length > 0 && (
          <div className="example-list">
            <h4>Examples</h4>
            {projectState.examples.map((ex) => (
              <button
                key={ex}
                className={`example-item ${projectState.configPath?.endsWith(ex) ? 'active' : ''}`}
                onClick={() => projectState.handleFileSelect(`configs/examples/${ex}`)}
              >
                {ex.replace('.toml', '')}
              </button>
            ))}
          </div>
        )}
      </div>

      <SettingsPanel
        settings={projectState.settings}
        onChange={projectState.setSettings}
        activeProfile={profileState.activeProfileData}
        getCacheStats={backend.getCacheStats}
        clearCache={backend.clearCache}
        getDiagnostics={backend.getDiagnostics}
      />
    </aside>
  );
}
