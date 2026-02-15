import { useState, useEffect, useCallback } from 'react';

const EMPTY_NEW_PROFILE = {
  _isNew: true,
  name: '',
  description: '',
  process_capabilities: {},
  material_rates: {},
  tolerance_capabilities: {
    min_it_grade: 7,
    max_it_grade: 12,
    surface_finish_range: { min: 0.8, max: 6.3 },
  },
  inspection: {
    cost_per_tolerance_pair: 5000,
    cmm_available: true,
  },
  batch_discounts: [
    { min_qty: 1, max_qty: 10, discount: 0 },
    { min_qty: 11, max_qty: 100, discount: 0.1 },
    { min_qty: 101, max_qty: 500, discount: 0.2 },
    { min_qty: 501, max_qty: null, discount: 0.3 },
  ],
};

export function useProfileState({ backend }) {
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState('_default');
  const [activeProfileData, setActiveProfileData] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  useEffect(() => {
    backend.getProfiles()
      .then((profs) => {
        if (profs) setProfiles(profs);
      })
      .catch(() => setProfiles([]));
  }, [backend]);

  useEffect(() => {
    if (activeProfile && activeProfile !== '_default') {
      backend.getProfile(activeProfile)
        .then((data) => setActiveProfileData(data))
        .catch(() => setActiveProfileData(null));
      return;
    }
    setActiveProfileData(null);
  }, [activeProfile, backend]);

  const handleProfileChange = useCallback((name) => {
    setActiveProfile(name);
  }, []);

  const handleEditProfile = useCallback(async () => {
    try {
      const full = await backend.getProfile(activeProfile);
      setEditingProfile(full);
      setShowProfileModal(true);
    } catch {
      backend.setError('Failed to load profile');
    }
  }, [activeProfile, backend]);

  const handleNewProfile = useCallback(() => {
    setEditingProfile({ ...EMPTY_NEW_PROFILE });
    setShowProfileModal(true);
  }, []);

  const handleSaveProfile = useCallback(async (profile) => {
    try {
      await backend.saveProfile(profile);
      const updated = await backend.getProfiles();
      setProfiles(updated || []);
      setShowProfileModal(false);
    } catch {
      backend.setError('Failed to save profile');
    }
  }, [backend]);

  const handleDeleteProfile = useCallback(async (name) => {
    try {
      await backend.deleteProfile(name);
      if (activeProfile === name) {
        setActiveProfile('_default');
      }
      const updated = await backend.getProfiles();
      setProfiles(updated || []);
      setShowProfileModal(false);
    } catch {
      backend.setError('Failed to delete profile');
    }
  }, [activeProfile, backend]);

  const openCompareModal = useCallback(() => {
    setShowCompareModal(true);
  }, []);

  const closeCompareModal = useCallback(() => {
    setShowCompareModal(false);
  }, []);

  const closeProfileModal = useCallback(() => {
    setShowProfileModal(false);
  }, []);

  return {
    profiles,
    activeProfile,
    setActiveProfile,
    activeProfileData,
    showProfileModal,
    editingProfile,
    showCompareModal,
    handleProfileChange,
    handleEditProfile,
    handleNewProfile,
    handleSaveProfile,
    handleDeleteProfile,
    openCompareModal,
    closeCompareModal,
    closeProfileModal,
  };
}
