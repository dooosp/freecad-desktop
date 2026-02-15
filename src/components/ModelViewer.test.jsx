import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState } = vi.hoisted(() => ({
  mockState: {
    loadMode: 'success',
    lastLoaderUrl: null,
    lastMesh: null,
    lastControls: null,
    lastRenderer: null,
    lastCamera: null,
  },
}));

vi.mock('three', () => {
  class Scene {
    constructor() {
      this.add = vi.fn();
      this.remove = vi.fn();
      this.background = null;
    }
  }

  class Color {
    constructor(value) {
      this.value = value;
    }
  }

  class PerspectiveCamera {
    constructor() {
      this.position = { set: vi.fn() };
      this.aspect = 1;
      this.updateProjectionMatrix = vi.fn();
      this.lookAt = vi.fn();
      mockState.lastCamera = this;
    }
  }

  class WebGLRenderer {
    constructor() {
      this.domElement = document.createElement('canvas');
      this.setSize = vi.fn();
      this.setPixelRatio = vi.fn();
      this.render = vi.fn();
      this.dispose = vi.fn();
      mockState.lastRenderer = this;
    }
  }

  class AmbientLight {
    constructor() {}
  }

  class DirectionalLight {
    constructor() {
      this.position = { set: vi.fn() };
    }
  }

  class GridHelper {
    constructor() {}
  }

  class Vector3 {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.z = 0;
    }
  }

  class MeshPhongMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.dispose = vi.fn();
    }
  }

  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      mockState.lastMesh = this;
    }
  }

  return {
    Scene,
    Color,
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    GridHelper,
    Vector3,
    MeshPhongMaterial,
    Mesh,
  };
});

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class OrbitControls {
    constructor() {
      this.enableDamping = false;
      this.dampingFactor = 0;
      this.update = vi.fn();
      this.target = { set: vi.fn() };
      mockState.lastControls = this;
    }
  },
}));

vi.mock('three/addons/loaders/STLLoader.js', () => ({
  STLLoader: class STLLoader {
    load(url, onLoad, _onProgress, onError) {
      mockState.lastLoaderUrl = url;
      if (mockState.loadMode === 'error') {
        onError?.(new Error('mock load failure'));
        return;
      }
      const geometry = {
        computeBoundingBox: vi.fn(),
        center: vi.fn(),
        attributes: { position: { count: 300 } },
        boundingBox: {
          getSize(vec) {
            vec.x = 10;
            vec.y = 20;
            vec.z = 30;
          },
        },
      };
      onLoad(geometry);
    }
  },
}));

import ModelViewer from './ModelViewer.jsx';

describe('ModelViewer', () => {
  beforeEach(() => {
    mockState.loadMode = 'success';
    mockState.lastLoaderUrl = null;
    mockState.lastMesh = null;
    mockState.lastControls = null;
    mockState.lastRenderer = null;
    mockState.lastCamera = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders placeholder when no stl path is provided', () => {
    render(<ModelViewer stlPath={null} />);
    expect(screen.getByText('Load a config and run analysis to view the 3D model')).toBeTruthy();
    expect(mockState.lastLoaderUrl).toBeNull();
  });

  it('loads STL, shows geometry info, and supports toolbar actions', async () => {
    const { unmount } = render(<ModelViewer stlPath={'output\\part.stl'} />);

    await waitFor(() => {
      expect(mockState.lastLoaderUrl).toBe('/artifacts/part.stl');
      expect(screen.getByText('10.0 x 20.0 x 30.0 mm')).toBeTruthy();
      expect(screen.getByText('100 faces')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('Wireframe'));
    await waitFor(() => {
      expect(mockState.lastMesh.material.wireframe).toBe(true);
    });

    fireEvent.click(screen.getByTitle('Reset View'));
    expect(mockState.lastCamera.position.set).toHaveBeenCalled();
    expect(mockState.lastControls.target.set).toHaveBeenCalled();

    fireEvent(window, new Event('resize'));
    expect(mockState.lastRenderer.setSize).toHaveBeenCalled();
    expect(mockState.lastCamera.updateProjectionMatrix).toHaveBeenCalled();

    unmount();
    expect(mockState.lastRenderer.dispose).toHaveBeenCalled();
  });

  it('logs STL loader errors without crashing', async () => {
    mockState.loadMode = 'error';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ModelViewer stlPath="output/fail.stl" />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });

    errorSpy.mockRestore();
  });
});
