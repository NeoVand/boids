import { useState, useId, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Stack,
  Switch,
  Typography,
  Tooltip,
  alpha,
  IconButton,
  Collapse,
  Fade,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SettingsIcon from '@mui/icons-material/Settings';
import { BoidsParameters, BoidsState, ParticleType } from '../../utils/boids';
import React from 'react';

interface BoidsControlsProps {
  state: BoidsState;
  onParameterChange: (params: Partial<BoidsParameters>) => void;
  onParticleTypeChange: (type: ParticleType) => void;
  onToggleRunning: () => void;
  onTogglePerceptionRadius: () => void;
  onReset: (count?: number) => void;
  onBoidsCountChange?: (count: number) => void;
}

// Common styles for consistent theming
const uiStyles = {
  backgroundColor: alpha('#080808', 0.55),
  backdropFilter: 'blur(16px)',
  borderColor: alpha('#ffffff', 0.05),
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
};

// Helper component for slider with tooltip
interface SliderWithTooltipProps { 
  label: string;
  value: number;
  onChange: (event: Event, value: number | number[]) => void;
  onChangeCommitted?: (event: React.SyntheticEvent | Event, value: number | number[]) => void;
  min: number;
  max: number;
  step: number;
  tooltip: string;
}

const SliderWithTooltip = ({ 
  label, 
  value, 
  onChange, 
  onChangeCommitted,
  min, 
  max, 
  step, 
  tooltip
}: SliderWithTooltipProps) => {
  const id = useId();
  
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Typography id={id} variant="caption" fontWeight="medium" color="text.primary">
          {label}
        </Typography>
        <Tooltip title={tooltip} arrow placement="top">
          <InfoIcon 
            sx={{ 
              ml: 0.5, 
              fontSize: 12, 
              color: 'text.secondary',
              cursor: 'help'
            }} 
          />
        </Tooltip>
      </Box>
      <Slider
        aria-labelledby={id}
        value={value}
        onChange={onChange}
        onChangeCommitted={onChangeCommitted}
        min={min}
        max={max}
        step={step}
        valueLabelDisplay="auto"
        size="small"
        sx={{
          color: 'primary.main',
          '& .MuiSlider-valueLabel': {
            backgroundColor: 'primary.dark',
            fontSize: '0.7rem',
            padding: '2px 4px',
          },
          '& .MuiSlider-thumb': {
            width: 8,
            height: 8,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0px 0px 0px 6px ${alpha('#4169e1', 0.16)}`
            }
          },
          '& .MuiSlider-rail': {
            opacity: 0.3,
          },
          '& .MuiSlider-track': {
            height: 2,
          },
          py: 0,
          mt: -0.5,
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
  onTogglePerceptionRadius,
  onReset,
  onBoidsCountChange,
}: BoidsControlsProps) => {
  const [boidsCount, setBoidsCount] = useState<number>(state.boids.length);
  const [expanded, setExpanded] = useState<boolean>(true);
  const particleTypeId = useId();
  const edgeBehaviorId = useId();
  const showRadiusId = useId();
  
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

  const handleParticleTypeChange = (event: SelectChangeEvent) => {
    onParticleTypeChange(event.target.value as ParticleType);
  };

  const handleBoidsCountChange = (_event: Event, value: number | number[]) => {
    const newCount = value as number;
    setBoidsCount(newCount);
    
    // Use the efficient direct method if available
    if (onBoidsCountChange) {
      onBoidsCountChange(newCount);
    }
  };
  
  const handleBoidsCountChangeCommitted = (_event: React.SyntheticEvent | Event, value: number | number[]) => {
    // Only update when slider interaction ends if direct method is not available
    if (!onBoidsCountChange) {
      onReset(value as number);
    }
  };

  const handleResetClick = () => {
    onReset(boidsCount);
  };

  const handleEdgeBehaviorChange = (event: SelectChangeEvent) => {
    onParameterChange({
      edgeBehavior: event.target.value as 'wrap' | 'bounce' | 'avoid',
    });
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <Fade in timeout={300}>
      <Card
        elevation={3}
        sx={{
          position: 'absolute',
          top: { xs: 8, sm: 12 },
          right: { xs: 8, sm: 12 },
          width: { xs: expanded ? 'calc(100% - 16px)' : 'auto', sm: expanded ? 280 : 'auto' },
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          ...uiStyles,
          borderRadius: 1.5,
          border: '1px solid',
          transition: 'width 0.3s ease-in-out, background-color 0.3s ease',
          '&::-webkit-scrollbar': {
            width: '4px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: alpha('#ffffff', 0.1),
            borderRadius: '2px',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: { xs: 1, sm: 1.5 },
            py: { xs: 0.75, sm: 1 },
            borderBottom: expanded ? `1px solid ${alpha('#ffffff', 0.05)}` : 'none',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton 
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse controls" : "Expand controls"}
              size="small"
              sx={{ mr: 0.5, p: 0.5 }}
            >
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
            <Typography 
              variant="subtitle2" 
              fontWeight="medium" 
              color="primary.main"
              sx={{ 
                display: 'flex', 
                alignItems: 'center',
                fontSize: { xs: '0.75rem', sm: '0.85rem' }
              }}
            >
              {!expanded && <SettingsIcon sx={{ mr: 0.5, fontSize: '0.9rem' }} />}
              {expanded ? 'Boids Controls' : 'Controls'}
            </Typography>
          </Box>
          
          <Box>
            <IconButton
              color="primary"
              size="small"
              onClick={onToggleRunning}
              aria-label={state.isRunning ? "Pause simulation" : "Play simulation"}
              sx={{
                p: 0.75,
                backgroundColor: alpha(state.isRunning ? '#f44336' : '#4caf50', 0.1),
                '&:hover': {
                  backgroundColor: alpha(state.isRunning ? '#f44336' : '#4caf50', 0.2),
                }
              }}
            >
              {state.isRunning ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expanded}>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Stack spacing={1.5}>
              {/* Particle Type & Edge Behavior Row */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id={particleTypeId} sx={{ fontSize: '0.75rem' }}>Type</InputLabel>
                  <Select
                    labelId={particleTypeId}
                    id="particle-type-select"
                    value={state.particleType}
                    label="Type"
                    onChange={handleParticleTypeChange}
                    sx={{ 
                      fontSize: '0.75rem',
                      '.MuiSelect-select': { 
                        py: 0.75,
                      }
                    }}
                  >
                    <MenuItem value="disk" sx={{ fontSize: '0.75rem' }}>Disk</MenuItem>
                    <MenuItem value="dot" sx={{ fontSize: '0.75rem' }}>Dot</MenuItem>
                    <MenuItem value="arrow" sx={{ fontSize: '0.75rem' }}>Arrow</MenuItem>
                    <MenuItem value="trail" sx={{ fontSize: '0.75rem' }}>Trail</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id={edgeBehaviorId} sx={{ fontSize: '0.75rem' }}>Edge</InputLabel>
                  <Select
                    labelId={edgeBehaviorId}
                    id="edge-behavior-select"
                    value={state.parameters.edgeBehavior}
                    label="Edge"
                    onChange={handleEdgeBehaviorChange}
                    sx={{ 
                      fontSize: '0.75rem',
                      '.MuiSelect-select': { 
                        py: 0.75,
                      }
                    }}
                  >
                    <MenuItem value="wrap" sx={{ fontSize: '0.75rem' }}>Wrap</MenuItem>
                    <MenuItem value="bounce" sx={{ fontSize: '0.75rem' }}>Bounce</MenuItem>
                    <MenuItem value="avoid" sx={{ fontSize: '0.75rem' }}>Avoid</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {/* Parameters Sliders */}
              <SliderWithTooltip
                label="Alignment"
                value={state.parameters.alignmentForce}
                onChange={handleSliderChange('alignmentForce')}
                min={0}
                max={2}
                step={0.1}
                tooltip="How strongly boids align with neighbors"
              />

              <SliderWithTooltip
                label="Cohesion" 
                value={state.parameters.cohesionForce}
                onChange={handleSliderChange('cohesionForce')}
                min={0}
                max={2}
                step={0.1}
                tooltip="How strongly boids are attracted to flock center"
              />

              <SliderWithTooltip
                label="Separation"
                value={state.parameters.separationForce}
                onChange={handleSliderChange('separationForce')}
                min={0}
                max={3}
                step={0.1}
                tooltip="How strongly boids avoid neighbors"
              />

              <SliderWithTooltip
                label="Perception"
                value={state.parameters.perceptionRadius}
                onChange={handleSliderChange('perceptionRadius')}
                min={10}
                max={200}
                step={5}
                tooltip="How far each boid can see"
              />

              <SliderWithTooltip
                label="Max Speed"
                value={state.parameters.maxSpeed}
                onChange={handleSliderChange('maxSpeed')}
                min={1}
                max={10}
                step={0.5}
                tooltip="Maximum velocity of boids"
              />

              <SliderWithTooltip
                label="Attraction"
                value={state.parameters.attractionForce}
                onChange={handleSliderChange('attractionForce')}
                min={0}
                max={5}
                step={0.5}
                tooltip="Strength of attraction to cursor when clicked"
              />

              <SliderWithTooltip
                label="Trail Length"
                value={state.parameters.trailLength}
                onChange={handleSliderChange('trailLength')}
                min={2}
                max={30}
                step={1}
                tooltip="Length of trail for trail type"
              />

              <SliderWithTooltip
                label="Population"
                value={boidsCount}
                onChange={handleBoidsCountChange}
                onChangeCommitted={handleBoidsCountChangeCommitted}
                min={10}
                max={10000}
                step={10}
                tooltip="Number of boids to simulate"
              />

              {/* Toggles and Buttons */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <FormControlLabel
                  control={
                    <Switch
                      id={showRadiusId}
                      checked={state.showPerceptionRadius}
                      onChange={onTogglePerceptionRadius}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="caption" color="text.primary">
                      Show Radius
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
                
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<RestartAltIcon fontSize="small" />}
                  onClick={handleResetClick}
                  aria-label={`Reset with ${boidsCount} boids`}
                  size="small"
                  sx={{
                    fontWeight: 'medium',
                    textTransform: 'none',
                    fontSize: '0.7rem',
                    py: 0.5,
                    ml: 'auto',
                  }}
                >
                  Reset
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Collapse>
      </Card>
    </Fade>
  );
}; 