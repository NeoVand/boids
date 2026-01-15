import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  IconButton,
  Typography,
  Slider,
  Button,
  Tooltip,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import PaletteIcon from '@mui/icons-material/Palette';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SpeedIcon from '@mui/icons-material/Speed';
import StraightenIcon from '@mui/icons-material/Straighten';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BoltIcon from '@mui/icons-material/Bolt';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import TimelineIcon from '@mui/icons-material/Timeline';
import GroupsIcon from '@mui/icons-material/Groups';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import { BoidsParameters, BoidsState } from '../../utils/boids';
import React from 'react';

interface EnhancedBoidsControlsProps {
  state: BoidsState;
  onParameterChange: (params: Partial<BoidsParameters>) => void;
  onToggleRunning: () => void;
  onReset: (count?: number) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onPopulationChange?: (count: number) => void;
  onColorizationChange?: (mode: string) => void;
  performanceStats?: {
    fps: number;
    frameTime: number;
    boidCount: number;
  };
  gpuEnabled?: boolean;
  onToggleGPU?: (enabled: boolean) => void;
}

// Compact slider with label and value
const CompactSlider = ({ 
  label, 
  value, 
  min, 
  max, 
  step,
  onChange,
  tooltip,
  icon
}: { 
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (event: Event, value: number | number[]) => void;
  tooltip: string;
  icon?: React.ReactNode;
}) => {
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {icon}
          <Typography variant="caption" sx={{ color: 'rgba(220,225,232,0.9)', fontWeight: 500 }}>
            {label}
          </Typography>
          <Tooltip title={tooltip} arrow placement="top">
            <InfoOutlinedIcon sx={{ ml: 0.25, fontSize: '0.75rem', color: 'rgba(200,205,212,0.7)' }} />
          </Tooltip>
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
          {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : value}
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
          color: '#c6ccd6',
          height: 3,
          '& .MuiSlider-thumb': {
            width: 10,
            height: 10,
            border: '1px solid rgba(255,255,255,0.35)',
          }
        }}
      />
    </Box>
  );
};

const SectionHeader = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
    {icon}
    <Typography variant="caption" sx={{ color: 'rgba(220,225,232,0.9)', fontWeight: 600, letterSpacing: '0.02em' }}>
      {label}
    </Typography>
  </Box>
);

export const EnhancedBoidsControls = ({
  state,
  onParameterChange,
  onToggleRunning,
  onReset,
  isCollapsed = false,
  onToggleCollapsed,
  onPopulationChange,
  onColorizationChange,
  gpuEnabled = false,
}: EnhancedBoidsControlsProps) => {
  const [boidsCount, setBoidsCount] = useState<number>(state.boids.length);
  
  // Update local count when boids count changes externally
  useEffect(() => {
    // console.log('Controls: updating boids count to', state.boids.length);
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
    
    if (onPopulationChange) {
      onPopulationChange(newCount);
    }
  };

  const handleColorizationChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    if (onColorizationChange) {
      onColorizationChange(event.target.value as string);
    }
  };

  const chromeText = 'rgba(220,225,232,0.9)';

  return (
    <div>
      {/* Collapsed gear */}
      {isCollapsed && (
        <IconButton 
          size="small" 
          onClick={onToggleCollapsed}
          sx={{ 
            backgroundColor: 'rgba(20, 22, 26, 0.6)',
            backdropFilter: 'blur(12px)',
            color: chromeText,
            border: '1px solid #2a2f36',
            width: 38,
            height: 38,
            transition: 'transform 0.2s ease, opacity 0.2s ease',
            '&:hover': {
              backgroundColor: 'rgba(30, 34, 40, 0.65)',
            }
          }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
      )}
      
      {/* Full controls panel */}
      {!isCollapsed && (
        <Card 
          elevation={2}
          sx={{
            width: 260,
            backgroundColor: 'rgba(20, 22, 26, 0.6)',
            backdropFilter: 'blur(18px)',
            color: chromeText,
            borderRadius: '10px',
            overflow: 'hidden',
            transition: 'transform 0.2s ease, opacity 0.2s ease',
            border: '1px solid #2a2f36',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
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
              backgroundColor: 'rgba(14, 16, 20, 0.8)',
              borderBottom: '1px solid #2a2f36',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton 
                size="small" 
                sx={{ mr: 1, color: chromeText }}
                onClick={onToggleCollapsed}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: chromeText }}>
                Simulation
              </Typography>
            </Box>
            
            <IconButton
              size="small"
              onClick={onToggleRunning}
              sx={{ 
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: chromeText,
                width: 28,
                height: 28,
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' }
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
                backgroundColor: 'rgba(160, 170, 185, 0.4)',
                borderRadius: '999px',
              },
            }}
          >
            <SectionHeader icon={<InfoIcon sx={{ color: chromeText }} fontSize="small" />} label="View" />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
              <Box
                sx={{
                  p: 0.5,
                  borderRadius: 1,
                  border: '1px solid #2a2f36',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }}
              >
                <Typography variant="caption" sx={{ color: 'rgba(200,205,212,0.8)', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <CompareArrowsIcon sx={{ fontSize: '0.85rem' }} /> Edge
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={state.parameters.edgeBehavior}
                  onChange={(_, value) => value && onParameterChange({ edgeBehavior: value as any })}
                  sx={{
                    width: '100%',
                    '& .MuiToggleButton-root': {
                      flex: 1,
                      border: '1px solid #2a2f36',
                      color: chromeText,
                      textTransform: 'none',
                      fontSize: '0.7rem',
                      px: 0.5,
                      py: 0.25,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                    },
                    '& .Mui-selected': {
                      backgroundColor: 'rgba(140,150,165,0.2)',
                    },
                  }}
                >
                  <ToggleButton value="wrap">
                    <CompareArrowsIcon sx={{ fontSize: '0.85rem', mr: 0.5 }} /> Wrap
                  </ToggleButton>
                  <ToggleButton value="bounce">
                    <CallSplitIcon sx={{ fontSize: '0.85rem', mr: 0.5 }} /> Bounce
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box
                sx={{
                  p: 0.5,
                  borderRadius: 1,
                  border: '1px solid #2a2f36',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }}
              >
                <Typography variant="caption" sx={{ color: 'rgba(200,205,212,0.8)', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <PaletteIcon sx={{ fontSize: '0.85rem' }} /> Color
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={state.colorizationMode || 'speed'}
                  onChange={(_, value) => value && handleColorizationChange({ target: { value } } as any)}
                  sx={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 0.5,
                    '& .MuiToggleButton-root': {
                      border: '1px solid #2a2f36',
                      color: chromeText,
                      fontSize: '0.7rem',
                      px: 0.5,
                      py: 0.25,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                    },
                    '& .Mui-selected': {
                      backgroundColor: 'rgba(140,150,165,0.2)',
                    },
                  }}
                >
                  <ToggleButton value="speed">
                    <SpeedIcon sx={{ fontSize: '0.85rem' }} />
                  </ToggleButton>
                  <ToggleButton value="orientation">
                    <AltRouteIcon sx={{ fontSize: '0.85rem' }} />
                  </ToggleButton>
                  <ToggleButton value="neighbors">
                    <GroupsIcon sx={{ fontSize: '0.85rem' }} />
                  </ToggleButton>
                  <ToggleButton value="acceleration">
                    <BoltIcon sx={{ fontSize: '0.85rem' }} />
                  </ToggleButton>
                  <ToggleButton value="turning">
                    <CallSplitIcon sx={{ fontSize: '0.85rem' }} />
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>

            <Box
              sx={{
                p: 0.5,
                borderRadius: 1,
                border: '1px solid #2a2f36',
                backgroundColor: 'rgba(255,255,255,0.02)',
                mb: 1.5,
              }}
            >
              <Typography variant="caption" sx={{ color: 'rgba(200,205,212,0.8)', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <AdsClickIcon sx={{ fontSize: '0.85rem' }} /> Cursor
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={state.parameters.attractionMode}
                onChange={(_, value) => value && onParameterChange({ attractionMode: value as any })}
                sx={{
                  width: '100%',
                  '& .MuiToggleButton-root': {
                    flex: 1,
                    border: '1px solid #2a2f36',
                    color: chromeText,
                    textTransform: 'none',
                    fontSize: '0.7rem',
                    px: 0.5,
                    py: 0.25,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                  },
                  '& .Mui-selected': {
                    backgroundColor: 'rgba(140,150,165,0.2)',
                  },
                }}
              >
                <ToggleButton value="off">
                  Off
                </ToggleButton>
                <ToggleButton value="attract">
                  <NorthEastIcon sx={{ fontSize: '0.85rem', mr: 0.5 }} /> Attract
                </ToggleButton>
                <ToggleButton value="repel">
                  <SouthWestIcon sx={{ fontSize: '0.85rem', mr: 0.5 }} /> Repel
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider sx={{ my: 1.5, borderColor: '#2a2f36' }} />

            <SectionHeader icon={<TuneIcon sx={{ color: chromeText }} fontSize="small" />} label="Dynamics" />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <CompactSlider
                label="Size"
                value={state.parameters.boidSize ?? 0.5}
                min={0.1}
                max={1}
                step={0.05}
                onChange={handleSliderChange('boidSize')}
                tooltip="Visual size multiplier for boids"
                icon={<StraightenIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Perception"
                value={state.parameters.perceptionRadius}
                min={10}
                max={200}
                step={5}
                onChange={handleSliderChange('perceptionRadius')}
                tooltip="How far boids can see"
                icon={<VisibilityIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Alignment"
                value={state.parameters.alignmentForce}
                min={0}
                max={3}
                step={0.1}
                onChange={handleSliderChange('alignmentForce')}
                tooltip="How strongly boids align with neighbors"
                icon={<CenterFocusStrongIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Cohesion"
                value={state.parameters.cohesionForce}
                min={0}
                max={3}
                step={0.1}
                onChange={handleSliderChange('cohesionForce')}
                tooltip="How strongly boids are attracted to the flock center"
                icon={<AltRouteIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Separation"
                value={state.parameters.separationForce}
                min={0}
                max={4}
                step={0.1}
                onChange={handleSliderChange('separationForce')}
                tooltip="How strongly boids avoid each other"
                icon={<CallSplitIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Max Speed"
                value={state.parameters.maxSpeed}
                min={0.5}
                max={15}
                step={0.5}
                onChange={handleSliderChange('maxSpeed')}
                tooltip="Maximum velocity of boids"
                icon={<SpeedIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Max Force"
                value={state.parameters.maxForce}
                min={0.01}
                max={1.0}
                step={0.01}
                onChange={handleSliderChange('maxForce')}
                tooltip="Maximum steering force"
                icon={<BoltIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Attraction"
                value={state.parameters.attractionForce}
                min={0}
                max={1}
                step={0.05}
                onChange={handleSliderChange('attractionForce')}
                tooltip="Strength of attraction to cursor"
                icon={<AdsClickIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Tail Length"
                value={state.parameters.trailLength}
                min={5}
                max={300}
                step={1}
                onChange={handleSliderChange('trailLength')}
                tooltip="Previous positions kept per boid"
                icon={<TimelineIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Population"
                value={boidsCount}
                min={10}
                max={gpuEnabled ? 50000 : 5000}
                step={gpuEnabled ? 100 : 10}
                onChange={handleBoidsCountChange}
                tooltip={`Number of boids to simulate (max: ${gpuEnabled ? '50k' : '5k'})`}
                icon={<GroupsIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
                sx={{ 
                  fontSize: '0.72rem', 
                  py: 0.5,
                  textTransform: 'none',
                  borderColor: '#2a2f36',
                  color: chromeText,
                  '&:hover': { borderColor: '#3a414b', backgroundColor: 'rgba(255,255,255,0.04)' }
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