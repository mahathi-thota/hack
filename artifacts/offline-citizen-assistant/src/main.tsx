import { createRoot } from 'react-dom/client';

import App from './App';
import { installOfflineGuard } from './lib/offline-guard';

import './index.css';

installOfflineGuard();
createRoot(document.getElementById('root')!).render(<App />);
