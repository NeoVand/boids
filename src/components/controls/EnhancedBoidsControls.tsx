import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  IconButton,
  Typography,
  Slider,
  Select as MuiSelect,
  MenuItem as MuiMenuItem,
  Button,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TuneIcon from '@mui/icons-material/Tune';
import SettingsIcon from '@mui/icons-material/Settings';
// InfoIcon removed (no section headers)
import PaletteIcon from '@mui/icons-material/Palette';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SpeedIcon from '@mui/icons-material/Speed';
import StraightenIcon from '@mui/icons-material/Straighten';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BoltIcon from '@mui/icons-material/Bolt';
import GrainIcon from '@mui/icons-material/Grain';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import TimelineIcon from '@mui/icons-material/Timeline';
import GroupsIcon from '@mui/icons-material/Groups';
// TuneIcon and InfoOutlinedIcon removed
import CallSplitIcon from '@mui/icons-material/CallSplit';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import { BoidsParameters, BoidsState, BoundaryMode } from '../../utils/boids';
import React from 'react';

interface EnhancedBoidsControlsProps {
  state: BoidsState;
  onParameterChange: (params: Partial<BoidsParameters>) => void;
  onToggleRunning: () => void;
  onResetParticles: (count?: number) => void;
  onResetParameters: () => void;
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

// Compact slider with label and value (info icons removed for cleaner UI)
const CompactSlider = ({ 
  label, 
  value, 
  min, 
  max, 
  step,
  onChange,
  icon
}: { 
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (event: Event, value: number | number[]) => void;
  icon?: React.ReactNode;
}) => {
  return (
    <Box sx={{ display: 'grid', gridTemplateRows: 'auto auto', gap: 0.25 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 20 }}>
          {icon}
          <Typography variant="caption" sx={{ color: 'rgba(220,225,232,0.9)', fontWeight: 500 }}>
            {label}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.6)', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
        >
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

// Section headers removed per request

const FieldBlock = ({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) => (
  <Box
    sx={{
      p: 0.6,
      borderRadius: 1,
      border: '1px solid rgba(255,255,255,0.08)',
      backgroundColor: 'rgba(255,255,255,0.03)',
      minHeight: 76,
      display: 'flex',
      flexDirection: 'column',
      gap: 0.5,
      justifyContent: 'center',
    }}
  >
    <Typography
      variant="caption"
      sx={{
        color: 'rgba(200,205,212,0.85)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        letterSpacing: '0.01em',
      }}
    >
      {icon}
      {label}
    </Typography>
    {children}
  </Box>
);

type EdgeConfig = {
  left: 'none' | 'up' | 'down';
  right: 'none' | 'up' | 'down';
  top: 'none' | 'right' | 'left';
  bottom: 'none' | 'right' | 'left';
};

const EDGE_CONFIGS: Record<BoundaryMode, EdgeConfig> = {
  plane: { left: 'none', right: 'none', top: 'none', bottom: 'none' },
  cylinderX: { left: 'up', right: 'up', top: 'none', bottom: 'none' },
  cylinderY: { left: 'none', right: 'none', top: 'right', bottom: 'right' },
  torus: { left: 'up', right: 'up', top: 'right', bottom: 'right' },
  mobiusX: { left: 'up', right: 'down', top: 'none', bottom: 'none' },
  mobiusY: { left: 'none', right: 'none', top: 'right', bottom: 'left' },
  kleinX: { left: 'up', right: 'down', top: 'right', bottom: 'right' },
  kleinY: { left: 'up', right: 'up', top: 'right', bottom: 'left' },
  projectivePlane: { left: 'up', right: 'down', top: 'right', bottom: 'left' },
};

const BoundaryIcon = ({ mode, size = 18 }: { mode: BoundaryMode; size?: number }) => {
  const config = EDGE_CONFIGS[mode] ?? EDGE_CONFIGS.plane;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="5" width="14" height="14" rx="0.5" />

      {config.left !== 'none' && (
        config.left === 'up' ? (
          <>
            <path d="M3 12 L5 9 L7 12" strokeWidth="0.7" />
            <path d="M3 15 L5 12 L7 15" strokeWidth="0.7" />
          </>
        ) : (
          <>
            <path d="M3 9 L5 12 L7 9" strokeWidth="0.7" />
            <path d="M3 12 L5 15 L7 12" strokeWidth="0.7" />
          </>
        )
      )}

      {config.right !== 'none' && (
        config.right === 'up' ? (
          <>
            <path d="M17 12 L19 9 L21 12" strokeWidth="0.7" />
            <path d="M17 15 L19 12 L21 15" strokeWidth="0.7" />
          </>
        ) : (
          <>
            <path d="M17 9 L19 12 L21 9" strokeWidth="0.7" />
            <path d="M17 12 L19 15 L21 12" strokeWidth="0.7" />
          </>
        )
      )}

      {config.top !== 'none' && (
        config.top === 'right' ? (
          <path d="M10 3 L13 5 L10 7" strokeWidth="0.7" />
        ) : (
          <path d="M14 3 L11 5 L14 7" strokeWidth="0.7" />
        )
      )}

      {config.bottom !== 'none' && (
        config.bottom === 'right' ? (
          <path d="M10 17 L13 19 L10 21" strokeWidth="0.7" />
        ) : (
          <path d="M14 17 L11 19 L14 21" strokeWidth="0.7" />
        )
      )}
    </svg>
  );
};

export const EnhancedBoidsControls = ({
  state,
  onParameterChange,
  onToggleRunning,
  onResetParticles,
  onResetParameters,
  isCollapsed = false,
  onToggleCollapsed,
  onPopulationChange,
  onColorizationChange,
  gpuEnabled: _gpuEnabled = false,
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

  const handleResetParticles = () => {
    onResetParticles(boidsCount);
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
  const panelBg = 'rgba(18, 20, 24, 0.55)';
  const panelBorder = 'rgba(255,255,255,0.08)';
  const sectionBg = 'rgba(255,255,255,0.03)';

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
          elevation={0}
          sx={{
            width: 300,
            backgroundColor: panelBg,
            backdropFilter: 'blur(20px)',
            color: chromeText,
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'transform 0.2s ease, opacity 0.2s ease',
            border: `1px solid ${panelBorder}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
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
              backgroundColor: 'rgba(14, 16, 20, 0.55)',
              borderBottom: `1px solid ${panelBorder}`,
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
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
              <FieldBlock icon={<CompareArrowsIcon sx={{ fontSize: '0.85rem' }} />} label="Boundry">
                <MuiSelect
                  value={state.parameters.boundaryMode || 'plane'}
                  onChange={(e) => onParameterChange({ boundaryMode: e.target.value as any })}
                  displayEmpty
                  sx={{
                    color: chromeText,
                    fontSize: '0.72rem',
                    width: '100%',
                    minWidth: 0,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: 1,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.18)' },
                    '.MuiSelect-select': {
                      py: 0.6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }}
                  renderValue={(value) => {
                    const labelMap: Record<string, string> = {
                      plane: 'Plane (Bounce)',
                      cylinderX: 'Cylinder X',
                      cylinderY: 'Cylinder Y',
                      torus: 'Torus',
                      mobiusX: 'Mobius X',
                      mobiusY: 'Mobius Y',
                      kleinX: 'Klein X',
                      kleinY: 'Klein Y',
                      projectivePlane: 'Projective Plane',
                    };
                    const mode = (value as BoundaryMode) || 'plane';
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
                        <BoundaryIcon mode={mode} size={16} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {labelMap[String(mode)] || String(mode)}
                        </span>
                      </Box>
                    );
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        backgroundColor: 'rgba(20,22,26,0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: chromeText,
                        '& .MuiMenuItem-root': {
                          fontSize: '0.72rem',
                          py: 0.75,
                          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                          '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.1)' },
                          '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
                        },
                      },
                    },
                  }}
                >
                  <MuiMenuItem value="plane">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="plane" size={16} />
                      Plane (Bounce)
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="cylinderX">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="cylinderX" size={16} />
                      Cylinder X
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="cylinderY">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="cylinderY" size={16} />
                      Cylinder Y
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="torus">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="torus" size={16} />
                      Torus
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="mobiusX">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="mobiusX" size={16} />
                      Möbius X
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="mobiusY">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="mobiusY" size={16} />
                      Möbius Y
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="kleinX">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="kleinX" size={16} />
                      Klein X
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="kleinY">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="kleinY" size={16} />
                      Klein Y
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem value="projectivePlane">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BoundaryIcon mode="projectivePlane" size={16} />
                      Projective
                    </Box>
                  </MuiMenuItem>
                </MuiSelect>
              </FieldBlock>

              <FieldBlock icon={<PaletteIcon sx={{ fontSize: '0.85rem' }} />} label="Colorize">
                <MuiSelect
                  value={state.colorizationMode || 'orientation'}
                  onChange={handleColorizationChange as any}
                  displayEmpty
                  sx={{
                    color: chromeText,
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: 1,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.18)' },
                    '.MuiSelect-select': { py: 0.6, display: 'flex', alignItems: 'center', gap: 0.5 },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        backgroundColor: 'rgba(20,22,26,0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: chromeText,
                        '& .MuiMenuItem-root': {
                          fontSize: '0.72rem',
                          py: 0.75,
                          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                          '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.1)' },
                          '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
                        },
                      },
                    },
                  }}
                >
                  <MuiMenuItem value="speed">Speed</MuiMenuItem>
                  <MuiMenuItem value="orientation">Orientation</MuiMenuItem>
                  <MuiMenuItem value="neighbors">Neighbors</MuiMenuItem>
                  <MuiMenuItem value="acceleration">Acceleration</MuiMenuItem>
                  <MuiMenuItem value="turning">Turning</MuiMenuItem>
                </MuiSelect>
              </FieldBlock>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
              <FieldBlock icon={<PaletteIcon sx={{ fontSize: '0.85rem' }} />} label="Spectrum">
                <MuiSelect
                  value={state.parameters.colorSpectrum}
                  onChange={(e) => onParameterChange({ colorSpectrum: e.target.value as any })}
                  displayEmpty
                  sx={{
                    color: chromeText,
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: 1,
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.18)' },
                    '.MuiSelect-select': { py: 0.6, display: 'flex', alignItems: 'center', gap: 0.5 },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        backgroundColor: 'rgba(20,22,26,0.95)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: chromeText,
                        '& .MuiMenuItem-root': {
                          fontSize: '0.72rem',
                          py: 0.75,
                          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                          '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.1)' },
                          '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
                        },
                      },
                    },
                  }}
                >
                  <MuiMenuItem value="chrome">Chrome</MuiMenuItem>
                  <MuiMenuItem value="cool">Cool</MuiMenuItem>
                  <MuiMenuItem value="warm">Warm</MuiMenuItem>
                  <MuiMenuItem value="rainbow">Rainbow</MuiMenuItem>
                  <MuiMenuItem value="mono">Mono</MuiMenuItem>
                </MuiSelect>
              </FieldBlock>

              <FieldBlock icon={<SpeedIcon sx={{ fontSize: '0.85rem' }} />} label="Sensitivity">
                <CompactSlider
                  label=""
                  value={state.parameters.colorSensitivity}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={handleSliderChange('colorSensitivity')}
                />
              </FieldBlock>
            </Box>
            <Box
              sx={{
                p: 0.5,
                borderRadius: 1,
                border: `1px solid ${panelBorder}`,
                backgroundColor: sectionBg,
                mb: 1.2,
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
                    '&:focus': { outline: 'none' },
                    '&:focus-visible': { outline: 'none', boxShadow: 'none' },
                    '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none' },
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

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <CompactSlider
                label="Size"
                value={state.parameters.boidSize ?? 0.5}
                min={0.1}
                max={1}
                step={0.05}
                onChange={handleSliderChange('boidSize')}
                icon={<StraightenIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Perception"
                value={state.parameters.perceptionRadius}
                min={10}
                max={200}
                step={5}
                onChange={handleSliderChange('perceptionRadius')}
                icon={<VisibilityIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Alignment"
                value={state.parameters.alignmentForce}
                min={0}
                max={3}
                step={0.1}
                onChange={handleSliderChange('alignmentForce')}
                icon={<CenterFocusStrongIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Cohesion"
                value={state.parameters.cohesionForce}
                min={0}
                max={3}
                step={0.1}
                onChange={handleSliderChange('cohesionForce')}
                icon={<AltRouteIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Separation"
                value={state.parameters.separationForce}
                min={0}
                max={4}
                step={0.1}
                onChange={handleSliderChange('separationForce')}
                icon={<CallSplitIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Noise"
                value={state.parameters.noiseStrength}
                min={0}
                max={1}
                step={0.05}
                onChange={handleSliderChange('noiseStrength')}
                icon={<GrainIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Rebels"
                value={(state.parameters.rebelChance ?? 0.05) * 100}
                min={0}
                max={30}
                step={1}
                onChange={(_e, v) => onParameterChange({ rebelChance: (v as number) / 100 })}
                icon={<ShuffleIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Max Speed"
                value={state.parameters.maxSpeed}
                min={0.5}
                max={10}
                step={0.5}
                onChange={handleSliderChange('maxSpeed')}
                icon={<SpeedIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Max Force"
                value={state.parameters.maxForce}
                min={0.01}
                max={1.0}
                step={0.01}
                onChange={handleSliderChange('maxForce')}
                icon={<BoltIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Attraction"
                value={state.parameters.attractionForce}
                min={0}
                max={1}
                step={0.05}
                onChange={handleSliderChange('attractionForce')}
                icon={<AdsClickIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Tail Length"
                value={state.parameters.trailLength}
                min={5}
                max={100}
                step={1}
                onChange={handleSliderChange('trailLength')}
                icon={<TimelineIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
              <CompactSlider
                label="Population"
                value={boidsCount}
                min={10}
                max={50000}
                step={100}
                onChange={handleBoidsCountChange}
                icon={<GroupsIcon sx={{ fontSize: '0.85rem', color: chromeText }} />}
              />
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={handleResetParticles}
                sx={{ 
                  flex: 1,
                  fontSize: '0.72rem', 
                  py: 0.5,
                  textTransform: 'none',
                  borderColor: '#2a2f36',
                  color: chromeText,
                  '&:hover': { borderColor: '#3a414b', backgroundColor: 'rgba(255,255,255,0.04)' },
                  '&:focus': { outline: 'none' },
                  '&:focus-visible': { outline: 'none', boxShadow: 'none' },
                  '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none' }
                }}
              >
                Particles
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<TuneIcon />}
                onClick={onResetParameters}
                sx={{ 
                  flex: 1,
                  fontSize: '0.72rem', 
                  py: 0.5,
                  textTransform: 'none',
                  borderColor: '#2a2f36',
                  color: chromeText,
                  '&:hover': { borderColor: '#3a414b', backgroundColor: 'rgba(255,255,255,0.04)' },
                  '&:focus': { outline: 'none' },
                  '&:focus-visible': { outline: 'none', boxShadow: 'none' },
                  '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none' }
                }}
              >
                Defaults
              </Button>
            </Box>
          </Box>
        </Card>
      )}
    </div>
  );
}; 