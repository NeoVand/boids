import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  IconButton,
  Typography,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Tooltip,
  alpha,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import { BoidsParameters, BoidsState } from '../../utils/boids';
import React from 'react';

interface BoidsControlsProps {
  state: BoidsState;
  onParameterChange: (params: Partial<BoidsParameters>) => void;
  onToggleRunning: () => void;
  onReset: (count?: number) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onPopulationChange?: (count: number) => void;
  onColorizationChange?: (mode: string) => void;
}

// Compact slider with label and value
const CompactSlider = ({ 
  label, 
  value, 
  min, 
  max, 
  step,
  onChange,
  tooltip
}: { 
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (event: Event, value: number | number[]) => void;
  tooltip: string;
}) => {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
            {label}
          </Typography>
          <Tooltip title={tooltip} arrow placement="top">
            <InfoIcon sx={{ ml: 0.5, fontSize: '0.75rem', color: 'primary.main', opacity: 0.7 }} />
          </Tooltip>
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
          {value}
        </Typography>
      </Box>
      <Slider
        size="small"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        sx={{
          color: 'primary.main',
          height: 4,
          '& .MuiSlider-thumb': {
            width: 12,
            height: 12,
          }
        }}
      />
    </Box>
  );
};

export const BoidsControls = ({
  state,
  onParameterChange,
  onToggleRunning,
  onReset,
  isCollapsed = false,
  onToggleCollapsed,
  onPopulationChange,
  onColorizationChange,
}: BoidsControlsProps) => {
  const [boidsCount, setBoidsCount] = useState<number>(state.boids.length);
  
  // Update local count when boids count changes externally
  useEffect(() => {
    setBoidsCount(state.boids.length);
  }, [state.boids.length]);

  const handleSliderChange = (name: keyof BoidsParameters) => (
    _event: Event,
    value: number | number[]
  ) => {
    onParameterChange({ [name]: value as number });
  };

  const handleReset = () => {
    onReset(boidsCount);
  };

  const handleBoidsCountChange = (_event: Event, value: number | number[]) => {
    const newCount = value as number;
    setBoidsCount(newCount);
    
    // Update population immediately if handler provided
    if (onPopulationChange) {
      onPopulationChange(newCount);
    }
  };

  const handleColorizationChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    if (onColorizationChange) {
      onColorizationChange(event.target.value as string);
    }
  };

  return (
    <div>
      {/* Gear button for collapsed state */}
      {isCollapsed && (
        <IconButton 
          size="small" 
          onClick={onToggleCollapsed}
          sx={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(5px)',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(100, 100, 150, 0.15)',
            width: 38,
            height: 38,
            '&:hover': {
              backgroundColor: 'rgba(30, 30, 50, 0.4)',
            }
          }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
      )}
      
      {/* Full controls panel */}
      {!isCollapsed && (
        <Card 
          elevation={3}
          sx={{
            width: 220,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)',
            color: 'black',
            borderRadius: '4px',
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out',
            border: '1px solid',
            borderColor: 'rgba(100, 100, 150, 0.15)',
            maxHeight: 'calc(100vh - 20px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header bar with collapse toggle */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1,
              backgroundColor: 'rgba(14, 14, 21, 0.3)',
              borderBottom: '1px solid rgba(100, 100, 150, 0.15)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton 
                size="small" 
                sx={{ mr: 1, color: 'rgba(255,255,255,0.9)' }}
                onClick={onToggleCollapsed}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
              <Typography variant="subtitle2" sx={{ fontWeight: 500, color: 'rgba(255,255,255,0.95)' }}>
                Boids Controls
              </Typography>
            </Box>
            
            <IconButton
              size="small"
              color={state.isRunning ? "error" : "success"}
              onClick={onToggleRunning}
              sx={{ 
                backgroundColor: alpha(state.isRunning ? '#f44336' : '#4caf50', 0.1),
                width: 28,
                height: 28
              }}
            >
              {state.isRunning ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </IconButton>
          </Box>

          {/* All controls */}
          <Box
            sx={{
              p: 1,
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'rgba(65, 105, 225, 0.6)',
                borderRadius: '999px',
              },
            }}
          >
            {/* Edge behavior selector */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <FormControl size="small" fullWidth variant="outlined" sx={{ 
                '.MuiOutlinedInput-notchedOutline': { 
                  borderColor: 'rgba(100, 100, 150, 0.3)' 
                }
              }}>
                <InputLabel id="edge-select-label" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>Edge</InputLabel>
                <Select
                  labelId="edge-select-label"
                  value={state.parameters.edgeBehavior}
                  onChange={(e) => onParameterChange({ edgeBehavior: e.target.value as any })}
                  label="Edge"
                  sx={{ 
                    color: 'white', 
                    fontSize: '0.75rem',
                    '.MuiSelect-select': { 
                      py: 0.75 
                    }
                  }}
                >
                  <MenuItem value="wrap">Wrap</MenuItem>
                  <MenuItem value="bounce">Bounce</MenuItem>
                </Select>
              </FormControl>
            </Box>
              
            {/* Colorization selector */}
            <FormControl size="small" fullWidth variant="outlined" sx={{ 
              '.MuiOutlinedInput-notchedOutline': { 
                borderColor: 'rgba(100, 100, 150, 0.3)' 
              },
              mb: 2
            }}>
              <InputLabel id="color-select-label" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>Colorize</InputLabel>
              <Select
                labelId="color-select-label"
                value={state.colorizationMode || 'speed'}
                onChange={handleColorizationChange as any}
                label="Colorize"
                sx={{ 
                  color: 'white', 
                  fontSize: '0.75rem',
                  '.MuiSelect-select': { 
                    py: 0.75 
                  }
                }}
              >
                <MenuItem value="speed">Speed</MenuItem>
                <MenuItem value="orientation">Orientation</MenuItem>
                <MenuItem value="neighbors">Neighbors</MenuItem>
                <MenuItem value="acceleration">Acceleration</MenuItem>
                <MenuItem value="turning">Turning</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth variant="outlined" sx={{ 
              '.MuiOutlinedInput-notchedOutline': { 
                borderColor: 'rgba(100, 100, 150, 0.3)' 
              },
              mb: 2
            }}>
              <InputLabel id="spectrum-select-label" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>Spectrum</InputLabel>
              <Select
                labelId="spectrum-select-label"
                value={state.parameters.colorSpectrum}
                onChange={(e) => onParameterChange({ colorSpectrum: e.target.value as any })}
                label="Spectrum"
                sx={{ 
                  color: 'white', 
                  fontSize: '0.75rem',
                  '.MuiSelect-select': { 
                    py: 0.75 
                  }
                }}
              >
                <MenuItem value="chrome">Chrome</MenuItem>
                <MenuItem value="cool">Cool</MenuItem>
                <MenuItem value="warm">Warm</MenuItem>
                <MenuItem value="rainbow">Rainbow</MenuItem>
                <MenuItem value="mono">Mono</MenuItem>
              </Select>
            </FormControl>

            {/* Behavior Sliders */}
            <CompactSlider
              label="Size"
              value={state.parameters.boidSize ?? 0.5}
              min={0.1}
              max={1}
              step={0.05}
              onChange={handleSliderChange('boidSize')}
              tooltip="Visual size multiplier for boids"
            />

            <CompactSlider
              label="Alignment"
              value={state.parameters.alignmentForce}
              min={0}
              max={2}
              step={0.1}
              onChange={handleSliderChange('alignmentForce')}
              tooltip="How strongly boids align with neighbors"
            />
            
            <CompactSlider
              label="Cohesion"
              value={state.parameters.cohesionForce}
              min={0}
              max={2}
              step={0.1}
              onChange={handleSliderChange('cohesionForce')}
              tooltip="How strongly boids are attracted to the flock center"
            />
            
            <CompactSlider
              label="Separation"
              value={state.parameters.separationForce}
              min={0}
              max={3}
              step={0.1}
              onChange={handleSliderChange('separationForce')}
              tooltip="How strongly boids avoid each other"
            />

            <CompactSlider
              label="Noise"
              value={state.parameters.noiseStrength}
              min={0}
              max={1}
              step={0.05}
              onChange={handleSliderChange('noiseStrength')}
              tooltip="Randomness added to movement to prevent rigid alignment"
            />
            
            <CompactSlider
              label="Perception"
              value={state.parameters.perceptionRadius}
              min={10}
              max={200}
              step={5}
              onChange={handleSliderChange('perceptionRadius')}
              tooltip="How far boids can see"
            />
            
            <CompactSlider
              label="Max Speed"
              value={state.parameters.maxSpeed}
              min={1}
              max={10}
              step={0.5}
              onChange={handleSliderChange('maxSpeed')}
              tooltip="Maximum velocity of boids"
            />
            
            <CompactSlider
              label="Attraction"
              value={state.parameters.attractionForce}
              min={0}
              max={1}
              step={0.05}
              onChange={handleSliderChange('attractionForce')}
              tooltip="Strength of attraction to cursor"
            />

            <CompactSlider
              label="Color Sensitivity"
              value={state.parameters.colorSensitivity}
              min={0.5}
              max={3}
              step={0.1}
              onChange={handleSliderChange('colorSensitivity')}
              tooltip="Amplify or soften color variation"
            />
            
            <CompactSlider
              label="Tail Length"
              value={state.parameters.trailLength}
              min={5}
              max={100}
              step={1}
              onChange={handleSliderChange('trailLength')}
              tooltip="How many previous positions are kept per boid (min 5; tails always on)"
            />
            
            <CompactSlider
              label="Population"
              value={boidsCount}
              min={10}
              max={10000}
              step={100}
              onChange={handleBoidsCountChange}
              tooltip="Number of boids to simulate"
            />
            
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 1 }}>
              <Button
                variant="outlined"
                size="small"
                color="secondary"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
                sx={{ 
                  fontSize: '0.75rem', 
                  py: 0.5,
                  textTransform: 'none'
                }}
              >
                Reset
              </Button>
            </Box>
          </Box>
        </Card>
      )}
    </div>
  );
}; 