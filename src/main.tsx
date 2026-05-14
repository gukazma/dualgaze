import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CesiumProvider } from './features/cesium/CesiumContext';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <CesiumProvider>
      <App />
    </CesiumProvider>
  </StrictMode>,
);
