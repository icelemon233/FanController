import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import App from './app/App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('缺少应用界面入口。');
createRoot(root).render(<App />);
