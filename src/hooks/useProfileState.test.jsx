import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useProfileState } from './useProfileState.js';

function createBackendMock(overrides = {}) {
  return {
    getProfiles: vi.fn().mockResolvedValue([
      { name: '_default' },
      { name: 'sample_precision' },
    ]),
    getProfile: vi.fn().mockResolvedValue({
      name: 'sample_precision',
      process_capabilities: { machining: { available: true } },
    }),
    saveProfile: vi.fn().mockResolvedValue({ success: true }),
    deleteProfile: vi.fn().mockResolvedValue({ success: true }),
    setError: vi.fn(),
    ...overrides,
  };
}

describe('useProfileState', () => {
  it('loads profiles on mount', async () => {
    const backend = createBackendMock();

    const { result } = renderHook(() => useProfileState({ backend }));

    await waitFor(() => {
      expect(result.current.profiles.length).toBe(2);
    });

    expect(result.current.profiles.map((p) => p.name)).toEqual(['_default', 'sample_precision']);
    expect(result.current.activeProfile).toBe('_default');
  });

  it('loads active profile details when profile changes', async () => {
    const backend = createBackendMock();

    const { result } = renderHook(() => useProfileState({ backend }));

    await waitFor(() => {
      expect(backend.getProfiles).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.handleProfileChange('sample_precision');
    });

    await waitFor(() => {
      expect(backend.getProfile).toHaveBeenCalledWith('sample_precision');
    });

    expect(result.current.activeProfileData?.name).toBe('sample_precision');
  });

  it('creates a new profile draft and opens profile modal', async () => {
    const backend = createBackendMock();

    const { result } = renderHook(() => useProfileState({ backend }));

    await waitFor(() => {
      expect(result.current.profiles.length).toBe(2);
    });

    act(() => {
      result.current.handleNewProfile();
    });

    expect(result.current.showProfileModal).toBe(true);
    expect(result.current.editingProfile?._isNew).toBe(true);
    expect(result.current.editingProfile?.batch_discounts?.length).toBeGreaterThan(0);
  });

  it('deletes active profile and resets to _default', async () => {
    const backend = createBackendMock({
      getProfiles: vi
        .fn()
        .mockResolvedValueOnce([{ name: '_default' }, { name: 'sample_precision' }])
        .mockResolvedValueOnce([{ name: '_default' }]),
    });

    const { result } = renderHook(() => useProfileState({ backend }));

    await waitFor(() => {
      expect(backend.getProfiles).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.handleProfileChange('sample_precision');
    });

    await waitFor(() => {
      expect(result.current.activeProfile).toBe('sample_precision');
    });

    await act(async () => {
      await result.current.handleDeleteProfile('sample_precision');
    });

    expect(backend.deleteProfile).toHaveBeenCalledWith('sample_precision');
    expect(result.current.activeProfile).toBe('_default');
    expect(result.current.profiles.map((p) => p.name)).toEqual(['_default']);
    expect(result.current.showProfileModal).toBe(false);
  });

  it('surfaces edit failure through backend error state', async () => {
    const backend = createBackendMock({
      getProfile: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const { result } = renderHook(() => useProfileState({ backend }));

    await act(async () => {
      await result.current.handleEditProfile();
    });

    expect(backend.setError).toHaveBeenCalledWith('Failed to load profile');
  });
});
