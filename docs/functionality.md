# Functionality Documentation

This is a two-page webapp portfolio project that creates an interactive drawing experience with physics-based simulation.

## First Page (`draw.patrickdwyer.com`)
The first page provides a canvas-based drawing interface where users can create artwork using their mouse or touch input.

### Features
- Interactive drawing canvas
- Color picker for custom colors
- Mobile-friendly touch support
- Submit button to finalize drawing
- Responsive design that works on all screen sizes

### Technical Implementation
- Uses HTML5 Canvas for drawing
- Captures mouse/touch events for drawing
- Stores drawing data as a series of dots with:
  - x, y coordinates
  - color information
- On submission, encodes drawing data into URL query parameters
- Redirects to simulation page with drawing data

## Second Page (`draw.patrickdwyer.com/simulate`)
The second page performs a physics-based simulation that recreates the user's drawing using animated particles.

### Features
- Physics-based particle simulation
- Particle collision detection and response
- Progressive drawing completion
- Smooth animation
- Responsive canvas that maintains aspect ratio

### Technical Implementation
- Reads drawing data from URL query parameters
- For each final dot location:
  - Creates `n` simulation particles
  - Each particle has:
    - Random initial position
    - Random initial velocity
    - Target final position (from drawing data)
      - This should not be stored for each particle. 
    - Color (from drawing data)
- Physics simulation:
  - Frictionless particle collisions
  - Wall collisions with bounce
  - Velocity-based movement
- Completion logic:
  - Checks distance to target position for each particle
  - `x%` chance to "stick" when near target
  - Simulation ends when all particles are in position

### Query Parameters
The simulation page expects the following URL parameters:
- `dots`: Array of dot objects containing:
  - `x`: X coordinate (0-100)
  - `y`: Y coordinate (0-100)
  - `color`: Hex color code
- `n`: Number of particles per dot (default: 5)
- `x`: Sticking probability (default: 0.1)

### Performance Considerations
- Uses requestAnimationFrame for smooth animation
- Implements spatial partitioning for collision detection
- Optimizes particle count based on device capabilities
- Handles cleanup on page unload

## Development Guidelines
- Follow functional programming patterns
- Maintain pure functions where possible
- Use immutable data structures
- Implement proper error handling
- Document all public functions
- Write unit tests for core functionality

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Android Chrome)
- Minimum browser versions:
  - Chrome 60+
  - Firefox 55+
  - Safari 11+
  - Edge 79+