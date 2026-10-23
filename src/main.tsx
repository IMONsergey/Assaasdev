import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { AppProvider } from './app/AppProvider';
import { App } from './app/App';
import { config } from './config';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 60_000, gcTime: 5 * 60_000 }, mutations: { retry: false } } });
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
ReactDOM.createRoot(root).render(<React.StrictMode><QueryClientProvider client={queryClient}><AppProvider><BrowserRouter basename={config.basePath.replace(/\/$/, '') || '/'}><App /></BrowserRouter></AppProvider></QueryClientProvider></React.StrictMode>);
