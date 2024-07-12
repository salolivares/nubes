import { ThemeProvider } from '@/components/theme-provider';
import { ModeToggle } from './components/mode-toggle';
import { LoginForm } from './components/login-form';

export function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <ModeToggle />
      <LoginForm />
    </ThemeProvider>
  );
}
