'use strict';
// Example scripts written for this page.
globalThis.EISEN_EXAMPLES = [
  { name: 'Windblown tree', src: `// A trunk that forks at random. Change the seed for a new tree.
set background #dbe6ea
set maxdepth 40

{ y -5 color #5b3f2a } branch

// Each version of the rule keeps its own count. md 5 limits it to
// 5 uses along a path, then > leaf finishes that path.
rule branch md 5 > leaf {
  { s 0.42 1 0.42 } box
  { y 0.92 rz 26 ry 50 s 0.8 h 6 b 1.08 } branch
  { y 0.92 rz -30 ry 140 s 0.74 h 6 b 1.08 } branch
}

// A weight below 1 makes this three-way fork rarer than the one above.
rule branch w 0.6 md 5 > leaf {
  { s 0.42 1 0.42 } box
  { y 0.92 rz 18 ry 90 s 0.78 h 4 } branch
  { y 0.92 rz -22 ry 210 s 0.76 h 4 } branch
  { y 0.92 rx 24 ry 330 s 0.7 h 4 } branch
}

rule leaf {
  { s 1.5 color #3f8f4f b 1.1 } sphere
}
rule leaf w 0.4 {
  { s 1.2 color #d9822b } sphere
}` },
  { name: 'Coil of boxes', src: `// One rule calling itself, turning a little on every step.
set background #14213d
set maxdepth 900

{ sat 0.8 b 0.95 h 190 } coil
{ rz 120 sat 0.8 b 0.95 h 250 } coil
{ rz 240 sat 0.8 b 0.95 h 310 } coil

rule coil md 800 {
  { s 0.9 0.25 0.9 } box
  { x 0.1 y 0.06 ry 5 rz 0.35 s 0.997 h 0.25 } coil
}` },
  { name: 'Corner fractal', src: `// Eight smaller copies, one in each corner of the parent.
set background #f4f1f8
set colorpool list:#3a0ca3,#4361ee,#4cc9f0,#f72585,#ffffff

corners

#define d 0.72
rule corners md 4 > cell {
  { x d y d z d s 0.46 } corners
  { x d y d z -d s 0.46 } corners
  { x d y -d z d s 0.46 } corners
  { x d y -d z -d s 0.46 } corners
  { x -d y d z d s 0.46 } corners
  { x -d y d z -d s 0.46 } corners
  { x -d y -d z d s 0.46 } corners
  { x -d y -d z -d s 0.46 } corners
}

rule cell { { color random s 1.5 } box }` },
  { name: 'Random city', src: `// Weights set how common each building is.
set background #e7ecef
set colorpool list:#274c77,#6096ba,#a3cef1,#e7ecef,#ef8354,#bfc0c0

{ x 13 y 13 z -0.5 s 40 40 0.2 color #8b8c89 } box
22 * { x 1.25 } 22 * { y 1.25 } lot

rule lot w 5 { low }
rule lot w 3 { mid }
rule lot w 1 { tall }
rule lot w 1 { park }

rule low  { { color random z 0.5 s 1 1 1.4 } box }
rule mid  { { color random z 1.5 s 1 1 3.4 } box { z 3.4 s 0.5 color #555 } box }
rule tall {
  { color random } 8 * { z 1 s 0.97 0.97 1 b 0.98 } box
}
rule park {
  { z -0.34 s 1.1 1.1 0.1 color #6a994e } box
  { z 0.25 s 0.7 color #386641 } sphere
}` },
  { name: 'Double helix', src: `// Two strands of spheres, joined by a thin bar on every other step.
set background #0b132b
set maxdepth 300

strand

rule strand md 170 {
  pair
  { y 0.28 ry 9 h 2 } strand
}

rule pair {
  { x 3 s 0.7 color #5bc0be } sphere
  { x -3 s 0.7 color #f6ae2d } sphere
  rung
}
rule rung { }
rule rung { { s 6 0.08 0.08 color #dfe7fd } box }` },
  { name: 'Glass spires', src: `// Triangles, transparency and the raytracer's reflection setting.
set background #eef3f0
set raytracer::shiny::reflection 0.35
set raytracer::phong [0.6,0.5,0.4]
set colorpool list:#2a9d8f,#264653,#e9c46a,#e76f51

{ z -0.6 s 26 26 0.2 color #cfd8d3 } box::shiny
7 * { rz 51.43 } { x 4 } spire

rule spire md 12 {
  { color random a 0.75 } shard
  { z 0.85 rz 28 s 0.86 } spire
}

rule shard {
  triangle[0,0,0;1,0,0;0.5,0.5,1.4]
  triangle[1,0,0;1,1,0;0.5,0.5,1.4]
  triangle[1,1,0;0,1,0;0.5,0.5,1.4]
  triangle[0,1,0;0,0,0;0.5,0.5,1.4]
}` },
];
