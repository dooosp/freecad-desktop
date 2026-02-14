import React from 'react';

export default function ShopProfilePanel({ profiles, activeProfile, activeProfileData, onProfileChange, onEditProfile, onNewProfile }) {
  if (!profiles || profiles.length === 0) {
    return (
      <div className="profile-panel">
        <h3>Shop Profile</h3>
        <div className="profile-selector">
          <select disabled>
            <option>Loading...</option>
          </select>
        </div>
      </div>
    );
  }

  const processCount = activeProfileData?.process_capabilities
    ? Object.values(activeProfileData.process_capabilities).filter(p => p.available).length
    : 0;
  const materialCount = activeProfileData?.material_rates
    ? Object.values(activeProfileData.material_rates).filter(m => m.available).length
    : 0;

  return (
    <div className="profile-panel">
      <h3>Shop Profile</h3>
      <div className="profile-selector">
        <select value={activeProfile || '_default'} onChange={e => onProfileChange(e.target.value)}>
          {profiles.map(p => (
            <option key={p.name} value={p.name}>
              {p.name === '_default' ? 'Default' : p.name}
            </option>
          ))}
        </select>
        <button className="btn btn-icon" onClick={onEditProfile} title="Edit Profile">✎</button>
        <button className="btn btn-icon" onClick={onNewProfile} title="New Profile">+</button>
      </div>
      {activeProfileData && activeProfile !== '_default' && (
        <div className="profile-summary">
          {processCount} process{processCount !== 1 ? 'es' : ''}, {materialCount} material{materialCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
