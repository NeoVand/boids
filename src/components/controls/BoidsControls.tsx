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
import { BoidsParameters, BoidsState, ParticleType } from '../../utils/boids';
import React from 'react';

interface BoidsControlsProps {
  state: BoidsState;
  onParameterChange: (params: Partial<BoidsParameters>) => void;
  onParticleTypeChange: (type: ParticleType) => void;
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
  onParticleTypeChange,
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

  const handleParticleTypeChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    onParticleTypeChange(event.target.value as ParticleType);
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
            width: 240,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)',
            color: 'black',
            borderRadius: '4px',
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out',
            border: '1px solid',
            borderColor: 'rgba(100, 100, 150, 0.15)'
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
          <Box sx={{ p: 1.5 }}>
            {/* Type and Edge selectors */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              {/* Type selector */}
              <FormControl size="small" fullWidth variant="outlined" sx={{ 
                '.MuiOutlinedInput-notchedOutline': { 
                  borderColor: 'rgba(100, 100, 150, 0.3)' 
                }
              }}>
                <InputLabel id="type-select-label" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>Type</InputLabel>
                <Select
                  labelId="type-select-label"
                  value={state.particleType}
                  onChange={handleParticleTypeChange as any}
                  label="Type"
                  sx={{ 
                    color: 'white', 
                    fontSize: '0.75rem',
                    '.MuiSelect-select': { 
                      py: 0.75 
                    }
                  }}
                >
                  <MenuItem value="disk">Disk</MenuItem>
                  <MenuItem value="dot">Dot</MenuItem>
                  <MenuItem value="trail">Trail</MenuItem>
                </Select>
              </FormControl>
              
              {/* Edge behavior selector */}
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
                value={state.colorizationMode || 'default'}
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
                <MenuItem value="default">Default</MenuItem>
                <MenuItem value="speed">Speed</MenuItem>
                <MenuItem value="orientation">Orientation</MenuItem>
                <MenuItem value="random">Random</MenuItem>
                <MenuItem value="neighbors">Neighbors</MenuItem>
              </Select>
            </FormControl>

            {/* Behavior Sliders */}
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
              max={5}
              step={0.5}
              onChange={handleSliderChange('attractionForce')}
              tooltip="Strength of attraction to cursor"
            />
            
            {state.particleType === 'trail' && (
              <CompactSlider
                label="Trail Length"
                value={state.parameters.trailLength}
                min={2}
                max={30}
                step={1}
                onChange={handleSliderChange('trailLength')}
                tooltip="Length of history trail"
              />
            )}
            
            <CompactSlider
              label="Population"
              value={boidsCount}
              min={10}
              max={4000}
              step={10}
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