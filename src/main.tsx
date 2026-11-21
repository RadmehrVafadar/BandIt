import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '@fontsource-variable/dm-sans';
import { Login } from './Login.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(<Login />);
