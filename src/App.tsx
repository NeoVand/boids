import { useEffect, useState } from 'react';
import './App.css';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
import { EnhancedBoidsSimulation } from './components/boids/EnhancedBoidsSimulation';

// Create a custom dark theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4169e1',
    },
    secondary: {
      main: '#f06292',
    },
    background: {
      default: '#000000',
      paper: '#1a1e24',
    },
    text: {
      primary: '#e0e0e0',
      secondary: '#9e9e9e',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 600,
      letterSpacing: '-0.02em',
    },
    body2: {
      fontSize: '0.875rem',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          margin: 0,
          padding: 0,
          height: '100%',
          overflow: 'hidden'
        },
        body: {
          margin: 0,
          padding: 0,
          height: '100%',
          overflow: 'hidden',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#1a1e24',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#4169e1',
            borderRadius: '4px',
          },
        },
        '#root': {
          height: '100%'
        },
        '.App': {
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }
      },
    },
  },
});

function App() {
  // Handle window resize to update canvas dimensions
  const [, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App">
        {/* Use the enhanced GPU-accelerated BoidsSimulation component */}
        <EnhancedBoidsSimulation />
      </div>
    </ThemeProvider>
  );
}

export default App;
