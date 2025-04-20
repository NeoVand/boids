import { useEffect, useState, useRef } from 'react';
import './App.css';
import { ThemeProvider, CssBaseline, createTheme, Box, Typography, alpha } from '@mui/material';
import { BoidsCanvas } from './components/boids/BoidsCanvas';
import { BoidsControls } from './components/controls/BoidsControls';
import { useBoids } from './hooks/useBoids';

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
      default: '#0f1215',
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
        body: {
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
      },
    },
  },
});

function App() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  const [fps, setFps] = useState<number>(0);
  const fpsTimerRef = useRef<number | null>(null);
  
  // Initialize boids simulation with optimized WebGL renderer
  const { 
    state, 
    setParameters, 
    setParticleType, 
    toggleRunning, 
    togglePerceptionRadius, 
    resetBoids,
    getCurrentFps,
    setBoidsCount,
  } = useBoids({
    initialCount: 300,
    width: dimensions.width,
    height: dimensions.height,
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
  
  // Update FPS counter
  useEffect(() => {
    const updateFps = () => {
      setFps(getCurrentFps());
      fpsTimerRef.current = window.setTimeout(updateFps, 500);
    };
    
    fpsTimerRef.current = window.setTimeout(updateFps, 500);
    
    return () => {
      if (fpsTimerRef.current) {
        clearTimeout(fpsTimerRef.current);
      }
    };
  }, [getCurrentFps]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App">
        {/* FPS Counter */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            zIndex: 10,
            padding: '2px 6px',
            backgroundColor: alpha('#080808', 0.5),
            borderRadius: 1,
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            fontSize: '0.65rem',
            border: '1px solid',
            borderColor: alpha('#ffffff', 0.05),
            opacity: 0.6,
            transition: 'opacity 0.2s',
            '&:hover': {
              opacity: 0.9,
            },
          }}
        >
          <Typography 
            variant="caption" 
            sx={{
              fontSize: '0.65rem',
              fontWeight: 'medium',
              color: fps > 30 ? '#4caf50' : fps > 15 ? '#ff9800' : '#f44336',
              fontFamily: 'monospace',
            }}
          >
            {fps} FPS
          </Typography>
          <Box 
            component="span" 
            sx={{ 
              fontSize: '0.65rem', 
              color: 'text.secondary',
              display: { xs: 'none', sm: 'inline' },
              fontFamily: 'monospace',
            }}
          >
            • {state.boids.length} boids
          </Box>
        </Box>
        
        {/* Main Canvas - now using WebGL for better performance */}
        <BoidsCanvas state={state} className="boids-canvas" />
        
        {/* Controls with optimized boid count update */}
        <BoidsControls
          state={state}
          onParameterChange={setParameters}
          onParticleTypeChange={setParticleType}
          onToggleRunning={toggleRunning}
          onTogglePerceptionRadius={togglePerceptionRadius}
          onReset={resetBoids}
          onBoidsCountChange={setBoidsCount}
        />
      </div>
    </ThemeProvider>
  );
}

export default App;
