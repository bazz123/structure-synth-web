'use strict';
// Generated from the Examples folder of the Structure Synth 1.5.0 download.
globalThis.EISEN_EXAMPLES = (globalThis.EISEN_EXAMPLES || []).concat([
{
"name": "Arc Sphere",
"src": "// Arc Sphere.es\n// Inspired by Marius Watz spheres:\n// http://www.flickr.com/photos/watz/363931023/\n\nset maxobjects  10400\nset background #454\n\n// Camera settings. Place these before first rule call.\nset translation [-3.33009 0.0259899 -20]\nset rotation [0.147791 -0.237766 -0.960012 -0.822766 -0.568209 0.014066 -0.548833 0.787786 -0.279602]\nset pivot [0 0 0]\nset scale 0.18957\n\n7 * { s 0.9 z -2 y 0.5   } 1 * {  color #5a5 s 0.92  rz 0  }  r1\n7 * { s 0.9 z -2 y 0.5    } 1 * {  color #aaa  s 0.87   rz 0 }  r1\n7 * { s 0.9 z -2 y 0.5   } 1 * {  color #fff }  r1\n\nrule r1 w 40  {\n  ubox\n  dbox\n  { x 1 ry 3 } r1 \n}\n\nrule r1  w 14 {  r2 }\n\nrule r2 w 10 {  \n  { x 1 ry 3 } r2\n}\n\nrule r2  {  r1 }\n\nrule dbox w 8 maxdepth 15 {\n   { y -1 rx 2.9  } dbox\n   sbox\n}\n\nrule dbox { }\n\nrule ubox w 8  maxdepth 15 {\n { y 1 rx -2.9  }  ubox\nsbox\n}\n\nrule ubox { }\n\nrule sbox   {\n  { s 1.2  1.2 0.6  ry 5 }  box\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Ball",
"src": "set maxdepth 2000\n{ a 0.9 hue 30 } R1 \n\nrule R1 w 10 { \n{ x 1  rz 3 ry 5  } R1\n{ s 1 1 0.1 sat 0.9 } box\n} \n\nrule R1 w 10 { \n{ x 1  rz -3 ry 5  } R1\n{ s 1 1 0.1 } box\n} \n\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "BinaryKite",
"src": "set maxobjects 16000\n10 * { y 1 } 10 * { z 1 }  1 * { a 0.8  sat 0.9  } r1 \nset background #fff\n\n\nrule r1   {\n  { x 1  ry 4 } r1\n  xbox\n}\n\nrule r1   {\n{ x 1  ry -4  } r1\nxbox\n}\n\nrule r1   {\n{ x 1  rz -8  s 0.95 } r1\nxbox\n}\n\nrule r1   {\n{ x 1  rz 8  s 0.95   } r1\nxbox\n}\n\n\n\nrule r2 maxdepth 36 {\n{ ry 1  ry -13 x  1.2 b 0.99 h 12  } r2 \nxbox\n}\n\nrule xbox {\n  { s 1.1   color #000   } grid\n  { b 0.7  color #000    }  box\n}\n\nrule xbox {\n { s 1.1   color #000     } grid\n { b 0.7  color #fff      } box\n}\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "City of Glass",
"src": "set maxobjects 117600\n{ a 0.4 sat 0.5 } grinder \n\nrule grinder { \n  36 * { ry 10 z 1.2 b 0.99 h 2  } arm \n} \n\nrule arm {\n xbox\n {  rz -1 rx 3 z 0.22 x 0.3 ry 10 s 0.998  x 0.5 sat 0.9995 hue 0.05 }  arm\n}\n\nrule arm {\n   xbox\n  {  rz 1 rx 3 z 0.22 x 0.3 ry 10 s 0.99  x -0.5 sat 0.9995 hue 0.15 }  arm\n}\n\nrule xbox {\n  box\n}\n\nrule xbox {\n { s 0.9 } grid\n { b 0.7   } box\n}\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "Default",
"src": "// ------ Camera settings.\nset translation [0 -0.367113 -20]\nset rotation [0.963994 0.0575931 -0.259613 0.0514549 0.917418 0.394584 0.260899 -0.393735 0.881422]\nset pivot [0 0 0]\nset scale 0.408795\n\n// ------ The actual EisenScript\nset background #fff\nset maxdepth 400\n\n r0\n\nrule r0 {\n  3 * { rz 120  } R1\n  3 * { rz 120 } R2\n}\n\nrule R1 {\n  { x 1.3 rx 1.57 rz 6 ry 3 s 0.99 hue 0.4 sat 0.99  } R1\n  { s 4 } sphere::shiny\n}\n\nrule R2 {\n  { x -1.3 rz 6 ry 3 s 0.99 hue 0.4 sat 0.99 } R2\n  { s 4 }  sphere\n}\n\n// ----- Settings for internal raytracer\n\nset raytracer::shadows false\n\n// the number of samples controls the quality\n// '6' means 6x6 samples per pixels, and is the default.\nset raytracer::samples 6\n\n// dof is depth-of-field.\n// Use 'Edit | Show 3D Object Information' to find the correct plane \n// comment the line below to disable this.\nset raytracer::dof [0.23,0.07]\n\n// Set materials either globally,\n// or for a selected tag (e.g. 'shiny')\nset raytracer::shiny::reflection 0.3\nset raytracer::phong [0.5,0.6,0.2]\n ",
"group": "Structure Synth 1.5.0"
},
{
"name": "Frame In Frame",
"src": "{ hue 20 sat 0.8  } r2 \n\nrule r2 maxdepth 20 {\n{ s 0.75  rz 10  b 0.9   }  r2\nframe\n}\n\nrule frame  {\n{ s 0.1 1.1 0.1 x 5  z 5 } box\n{ s 0.1 1.1 0.1 x 5  z -5 } box\n{ s 0.1 1.1 0.1 x -5  z 5 } box\n{ s 0.1 1.1 0.1 x -5  z -5 } box\n\n{ s 1 0.1 0.1 y 5  z 5 } box\n{ s 1 0.1 0.1 y 5  z -5 } box\n{ s 1 0.1 0.1 y -5  z 5 } box\n{ s 1 0.1 0.1 y -5  z -5 } box\n\n{ s 0.1 0.1 1 y 5  x 5 } box\n{ s 0.1 0.1 1 y 5  x -5 } box\n{ s 0.1 0.1 1 y -5  x 5 } box\n{ s 0.1 0.1 1 y -5  x -5 } box\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Grinder",
"src": "// Grinder.es\n\nset maxobjects 117600\ngrinder \n\nrule grinder { \n  36 * { ry 10 z 1.2 b 0.99 } 1 * { ry 34  rx 34 }  arm \n} \n\nrule arm {\n xbox\n {  rz 2 rx 3 z 0.22 x 0.3 ry 10 s 0.999  x 0.5 sat 0.9995 hue 0.05 }  arm\n}\n\nrule arm {\n   xbox\n  {  rz 2 rx 3 z 0.22 x 0.3 ry 10 s 0.99  x 0.5 sat 0.9995 hue 0.15 }  arm\n}\n\nrule xbox {\n  { b 0.7   } box\n}\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "Konstrukt",
"src": "set background #000\n#define _md 400\n#define _rz 0\n#define _zoom 1\n\nset maxdepth _md\n\n{ rz _rz s _zoom } r0\n\nrule r0 {\n3 * { rz 120  } R1\n3 * { rz 120 } R2\n}\n\nrule R1 {\n{ x -1.3 rz 1.57 rz 6 ry 13 s 0.99 hue 1 sat 0.99 } R1\n{ s 4   color black } box\n}\n\nrule R2 {\n{ x -1.3 rz 6 ry 13 s 0.99 hue 1 sat 0.99 } R2\n{ s 4 a 1  color white } box\n} ",
"group": "Structure Synth 1.5.0"
},
{
"name": "Menger",
"src": "R1\n\nrule R1 maxdepth 3 > c2 {\n\t{ s 1/3 x -1 y -1  } R1 \n\t{ s 1/3 x -1 y -1  z -1 } R1 \n\t{ s 1/3 x -1 y -1  z +1 } R1 \n\t{ s 1/3 x 1 y -1  } R1 \n\t{ s 1/3 x 1 y -1  z -1 } R1 \n\t{ s 1/3 x 1 y -1  z +1 } R1 \n\t{ s 1/3  y -1  z -1 } R1  \n\t{ s 1/3  y -1  z +1 } R1 \n\t{ s 1/3 x -1 y 1  } R1 \n\t{ s 1/3 x -1 y 1  z -1 } R1 \n\t{ s 1/3 x -1 y 1  z +1 } R1 \n\t{ s 1/3 x 1 y 1  } R1 \n\t{ s 1/3 x 1 y 1  z -1 } R1 \n\t{ s 1/3 x 1 y 1  z +1 } R1 \n\t{ s 1/3  y 1  z -1 } R1  \n\t{ s 1/3  y 1  z +1 } R1 \n\t{ s 1/3 x -1   z -1 } R1 \n\t{ s 1/3 x -1   z +1 } R1 \n\t{ s 1/3 x 1    z -1 } R1 \n\t{ s 1/3 x 1    z +1 } R1 \n}\n\nrule c2 {\n box\n}\n\n\n\n\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "MeshTest",
"src": "set maxobjects 52222\nset background #a00\nR1\n{ x 3 s 0.9  } R1\n{ y 3 s 0.7 } R1\n{ y -3 s 0.6 } R1\n{ x -3 s 0.5 } R1\n\n// Camera settings. Place these before first rule call.\nset translation [-2.59764 -5.03937 -20]\nset rotation [0.946021 0.279788 0.163595 -0.166082 -0.0149648 0.985998 0.278318 -0.959945 0.0323107]\nset pivot [0 0 0]\nset scale 1.1874\n\n\nrule R1 maxdepth 30 > endrule {\n  { z 1 ry 6   s 0.91  hue 5  y 0.01 } R1\n mesh\n}\n\nrule R1 w 0.2 {\n{ z 1 ry 6   s 0.99  hue 1 } R1\n{ rz 90  } R1\nmesh\n}\n\nrule endrule {\n{ s 3 } sphere\n}\n\n\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "Moduli Creatures",
"src": "// Moduli Creatures. Syntopia 2010.\n// This one works best when raytraced in e.g. Sunflow.\n\n// Camera settings. Place these before first rule call.\nset translation [-8.07939 -6.42262 -20]\nset rotation [-0.608586 0.78168 -0.136359 0.78734 0.616241 0.0185897 0.0985613 -0.0960483 -0.99048]\nset pivot [0 0 0]\nset scale 0.625595\n\nset background grey\n50 * { x 1 rz 5 s 0.99 color red } 20 * { y 1 rz 3 hue 1 } d\n\nrule d md 30 {\n{ z 1 rx 5 } d\n{ s 0.01 1 1.2 sat 0.4 } box \n} \n\nrule d w 0.1 {\n e \n} \n\nrule e md 5 {\n{ z 1 rx 5 } e\n{ s 0.01  1 1.2 sat 0.4 } box \n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Mondrian",
"src": "// Mondrian Cube.\n \nmondrian\n\nrule mondrian {\n  //  The six faces of the cube  \n  a2 \n  { x -0.5 z -0.5 ry  90 } a2\n  { x +0.5 z -0.5 ry  90 } a2\n  { z -1 } a2\n  { y +0.5  z -0.5 rx  90 } a2\n  { y -0.5  z -0.5 rx  90 } a2\n}\n\nrule a2 w 2 maxdepth 2 > d {\n  // Split into two halves in x direction\n  {  s 0.333 1 1 x -1   } a2\n  {  s 0.666  1 1 x 0.26  } a2 \n}\n\nrule a2 w 2 maxdepth 2 > d {\n  // Split into two halves in y direction\n  {  s 1  0.333 1 y  -1   } a2\n  {  s 1 0.666   1 y 0.26  } a2\n}\n\n\nrule a2 {  d }\n\n// This rule chooses a random color.\nrule d {  {   s 1 1 0.02 color #F00 } square  }\nrule d {  {   s 1 1 0.02 color #0404A2  } square  }\nrule d {  {   s 1 1 0.02 color #FFFE33 } square  }\nrule d w 2 {  {   s 1 1 0.02 color #FFF  } square  }\n\n// Draws a framed square\nrule square {\n  { s 0.95 0.95 1  }  box \n  { s 0.05 1 1 b 0 x -10 } box \n  { s 0.05 1 1 b 0 x 10 } box \n  { s 1.05  0.05  1 b 0 y -10 } box \n  { s 1.05  0.05  1 b 0 y 10 } box \n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Nabla",
"src": "set maxdepth 30\n\n{ ry -90 color white } R1\n{rx -90 color white } R1\n{  x 30 y 30 z -3 s 900 900 1 color white } box\n\nRule R1 {\ndbox\n{ z 0.6 rx 5   }  R1\n}\n\nRule R1 {\n dbox\n{ z 0.6 rx -5 }  R1\n}\n\nRule R1 {\ndbox\n{ z 0.6 rz 5 }  R1\n}\n\nRule R1 {\n dbox\n{ z 0.6 rz -5 }  R1\n}\n\nRule R1 weight 0.01 {\n\n} \n\nRule dbox {\n  { s 1.5 1.6  0.5  }  box\n}\n\nRule dbox weight 0.5 {\n   { ry 90 s 0.5 } R1\n}\n\nRule dbox weight 0.5 {\n{ rx 90 s 0.5 } R1\n} ",
"group": "Structure Synth 1.5.0"
},
{
"name": "NablaSystem",
"src": "// 10, 20 , 21, 23, 33 , 104, 106, 118, 119, 127, 128, 133, 136, 138, 139\n//1, 66,69,70,73, 79 \n\nset maxdepth 30\n\n{ ry -90 b 0.2 } R1\n\n// Floor box\n//{  x 30 y 30 z -3 s 900 900 1 color red } box\n\nRule R1 {\ndbox\nset seed initial\n{ z 0.6 rx 5   }  R1\n}\n\nRule R1 {\n dbox\n{ z 0.5 rx -90 }  R1\n}\n\nRule R1 {\ndbox\n{ z 0.6 rz 90 }  R1\n}\n\nRule R1 {\n dbox\n{ z 0.6 rz -90 }  R1\n}\n\nRule R1 weight 0.01 {\n\n} \n\nRule dbox {\n  { color random s 2 2  0.5  }  box\n}\n\nRule dbox weight 0.5 {\n   { ry 90 s 0.5  1 1 } R1\n}\n\nRule dbox weight 0.5 {\n{ rx 90 s 0.5 2 1 } R1\n} ",
"group": "Structure Synth 1.5.0"
},
{
"name": "NineWorthies",
"src": "/// The Nine Worthies\n///  Syntopia 2009\n\nset maxobjects 52200\nset maxdepth 3000\nset background #232\n9 * { x 5 }  1 * { b 0.4  color #0a0    color white } r1 \n// { s 1000 1000 1 color white } box \n\n// Camera settings. Place these before first rule call.\nset translation [-4.50383 -2.80381 -20]\nset rotation [0.993991 0.0947988 -0.0545559 0.0140638 0.383866 0.923278 0.108471 -0.918504 0.380229]\nset pivot [0 0 0]\nset scale 0.209524\n\nrule r1 w  10  {\n  { rz 15 h 1    y 1  h 4  z 0.01 s 0.999  } r1 \n   r2\n}\n\nrule r1 w 0.1 {\n  { rx 10    z 1  s 0.99 } r1 \n   r2\n}\n\nrule r2 {\n  box\n  { s 1.1 0.2 0.2  color orange  } box\n  grid\n}\n\n\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "Nouveau",
"src": "#define shrink s 0.996\n\nset seed 9\n// Camera settings. Place these before first rule call.\nset translation [-2.66914 -1.23905 -20]\nset rotation [0.707436 -0.702911 -0.0738339 0.542177 0.472696 0.694696 -0.453408 -0.531484 0.715504]\nset pivot [0 0 0]\nset scale 0.953754\n\nset raytracer::dof [0.245,0.09]\n\nset maxdepth 1000\nset background #fff\n16 * { rz 20 color white } hbox\n\nrule hbox { r}\nrule r { forward }\nrule r { turn }\nrule r { turn2 }\nrule r { turn4 }\nrule r { turn3 }\n//rule r { turn5 }\n//rule r { turn6 }\n\nrule forward md 90 > r {\ndbox\n{ rz 2 x 0.1 shrink } forward\n}\n\nrule turn md 90 > r {\ndbox\n{ rz 2 x 0.1 shrink } turn\n}\n\nrule turn2 md 90 > r {\ndbox\n{ rz -2 x 0.1 shrink } turn2\n}\n\nrule turn3 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn3\n}\n\nrule turn4 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn4\n}\n\nrule turn5 md 90 > r {\ndbox\n{ rx -2 x 0.1 shrink } turn5\n}\n\nrule turn6 md 90 >  r {\ndbox\n{ rx -2 x 0.1 shrink } turn6\n}\n\nrule dbox {\n{ s 0.2 1 1 } box\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Nouveau2",
"src": "// Nouveau system variant.\n\n#define shrink s 0.999\n\nset maxdepth 1000\nset background #888\n6 * {  rz 60 color white } hbox\n//{ s 80 80 0.1 color white } box\n//set raytracer::light [0,0,-20]\n\nrule hbox { set seed initial  r}\nrule r { { rx 90 } forward }\nrule r { { rx -90 }forward }\nrule r { forward }\nrule r { forward }\nrule r { turn }\nrule r { turn2 }\n\nrule forward md 90 > r {\ndbox\n{ rz 2 x 0.1 shrink } forward\n}\n\nrule turn md 90 > r {\ndbox\n{ rz 2 x 0.1 shrink } turn\n}\n\nrule turn2 md 90 > r {\ndbox\n{ rz -2 x 0.1 shrink } turn2\n}\n\nrule turn3 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn3\n}\n\nrule turn4 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn4\n}\n\nrule turn5 md 90 > r {\ndbox\n{ rx -2 x 0.1 shrink } turn5\n}\n\nrule turn6 md 90 >  r {\ndbox\n{ rx -2 x 0.1 shrink } turn6\n}\n\nrule dbox {\n{ s 0.2 1 1 } box\n{ rx 10 s 0.2 1 1 color black } box\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Nouveau3",
"src": "// Nouveau variant (Rounded tubes)\n\n#define shrink s 0.996\n\n\nset maxdepth 1000\nset background #fff\n10 * { x 0 color white ry 10  } 2 * { rz 180  } hbox\n\nrule hbox { r}\nrule r { forward }\nrule r { turn }\nrule r { turn2 }\nrule r { turn4 }\nrule r { turn3 }\nrule r { turn5 }\nrule r { turn6 }\n\nrule forward md 90 > r {\ndbox\n{ rz 2 x 0.1 shrink } forward\n}\n\nrule turn md 90 > r {\ndbox\n{ rz 2 x 0.1 shrink } turn\n}\n\nrule turn2 md 90 > r {\ndbox\n{ rz -2 x 0.1 shrink } turn2\n}\n\nrule turn3 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn3\n}\n\nrule turn4 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn4\n}\n\nrule turn5 md 90 > r {\ndbox\n{ ry -2 x 0.1 shrink } turn5\n}\n\nrule turn6 md 90 >  r {\ndbox\n{ ry -2 x 0.1 shrink } turn6\n}\n\nrule dbox {\n{ s 0.2 1 1 } sphere\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Octopod II",
"src": "set maxdepth 100\n\n10 * { ry 36 sat 0.9 } 30 * { ry 10 } 1 * { h 30 b 0.8 sat 0.8 a 0.3  } r1\n\nrule r1 w 20 {\n   { s 0.9 rz 5 h 5 rx 5 x 1 }  r1\n   { s 1 0.2 0.5 } box\n}\n\nrule r1 w 20 {\n   {  s 0.99 rz -5 h 5 rx -5 x 1 }   r1\n   { s 1 0.2 0.5 } box\n}\n\nrule r1  {\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Pure Structure",
"src": "#define shrink  s 0.996\n\nset maxdepth 1000\nset background white \nset syncrandom true \n\n//set colorpool image:001.jpg\n\nset colorpool list:white,white,white,orange\nset minsize 0.5\n\n5 * { x 2 } 1 * { s 0.2 0.2 1 } s2\n\nrule s2 md 25 {\n   { z 1  } s2\n   start\n}\n\n\n\nrule start { 6  * { rz 60 } hbox }\n\nrule hbox md 10 { r }\n\nrule r {\n set seed initial \n forward\n}\n\nrule r {  turn }\nrule r  {  turn2 }\n\nrule forward md 90  >  r  {\n  dbox\n{ rz 2 x 0.1 shrink } forward\n}\n\nrule turn md 90  >  r  {\n    dbox\n{ rz 2  x 0.1 shrink } turn\n}\n\nrule turn2 md 90  >  r  {\n  dbox\n{ rz -2  x 0.1 shrink } turn2\n}\n\nrule turn3 md 90  >  r  {\n    dbox\n{ ry -2 x 0.1 shrink } turn3\n}\n\nrule turn4 md 90  >  r  {\n  dbox\n{ ry -2 x 0.1 shrink } turn4\n}\n\nrule turn5 md 90  >  r  {\n    dbox\n{ rx -2 x 0.1 shrink } turn5\n}\n\nrule turn6 md 90  >  r  {\n  dbox\n{ rx -2 x 0.1 shrink } turn6\n}\n\nrule dbox {\n{ s 0.2 1 1  color random } box\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Reflection",
"src": "// Reflection.es\n\nset raytracer::shadows false\nset raytracer::reflection 0.2\nset raytracer::phong [0.5,0.4,0.2]\nset raytracer::max-depth 5\nset background #fff\nset maxdepth 400\n2 * { rx 38 color white } R1\n\nrule R1 {\n  { x 1.3 rz 6 ry 3 s 0.99 hue 1 sat 0.99 blend red 0.02 } R1\n  { s 6 a 1 } sphere \n  { s 7 hue 120 a 0.2 } sphere \n}\n\nrule R2 {\n  { x -1.3 rz 6 ry 3 s 0.99 hue 1 sat 0.99 blend red 0.02 } R2\n  { s 6 a 1 } sphere\n  { s 7 hue 120 a 0.2 } sphere \n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "RoundTree",
"src": "set maxdepth 400\n1 * { ry 90 x 6 } 10 * { rx 36 color white } R1\n{ s 200 200 0.1 color white } box\n\nrule R1 {\n  { x 1 rz -4 ry 6 s 0.99 } R1\n  { s 2 } sphere\n}\n\nrule R1 {\n{ x 1 rz 4 ry 6 s 0.99 } R1\n{ s 2 } sphere\n}\n",
"group": "Structure Synth 1.5.0"
},
{
"name": "SpiralTree2D",
"src": "set maxdepth 600\n{ h 30 sat 0.7 } spiral\n{ ry 180 h 30 sat 0.7 } spiral\n \nrule spiral w 100 { \n box   \n{ y 0.4 rx 1 s 0.995 b 0.995 } spiral\n}\n\nrule spiral w 1 {  \nspiral\n{ ry 180 h 3  }  spiral\n} \n",
"group": "Structure Synth 1.5.0"
},
{
"name": "Synctor",
"src": "set maxdepth 600\n\nset background #f94\n\n{  sat 0.7 color green } start\n\nrule spiral w 100 {\n box\n { y 0.4 rx 5 hue 1 s 0.995 b 0.999 } spiral\n}\n\nrule spiral w 100 {\n box\n { y 0.4 rx 5 hue -1 rz -5 s 0.995 b 0.999 } spiral\n}\n\nrule spiral w 100 {\n box\n { y 0.4 rx 5 hue 0 rz 5 s 0.995 b 0.995 } spiral\n}\n\nrule spiral w 3 {\n start\n} \n\nrule start {\n set seed initial\n { rx 15 } spiral\n { ry 180 h 3 } spiral\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Thingy",
"src": "#define steps 30\nset minsize 0.01\nset background white\n\n10 * { s 0.8 rx 36 ry 10  } steps * { h 1 rz 360/steps } 1 * { x 10 rz 180} dspawn\n\nrule dspawn {\n   spawn\n   m\n}\n\nrule m {\n}\n\nrule spawn {\n  set seed initial\ndbox\n} \n\nrule dbox {\n  { x 0.1 s 0.99 sat  0.99  } dbox\n  box\n}\n\nrule dbox {\n  { x 0.1 s 0.99 ry 1 } dbox\n  box\n}\n\nrule dbox {\n  { x 0.1 s 0.99 ry -1 } dbox\n  box\n}\n\nrule dbox {\n  { x 0.1 s 0.99 ry 1 } dbox\n  box\n}\n\nrule dbox {\n  { x 0.1 s 0.99 rz -3 } dbox\n  box\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Torus2",
"src": "set maxobjects 160000\n{ a 0.3  sat 0.5 } grinder \n\nset background #fff\nrule grinder { \n   36 * { rz 10  y 0.1   }   36 * { ry 10  z 1.2 b 0.99 h 12  } xbox\n} \n\nrule xbox {\n  { s 1.1  } frame\n  { b 0.7  color #eee   a 0.2  }  box\n}\n\nrule xbox {\n { s 1.1    } frame\n { b 0.7  color #fff  a 0.3    } box\n}\n\n#define _f3 10\n#define _f1 0.05\n#define _f2 1.05\n\nrule frame  {\n{ s _f1 _f2 _f1  x _f3  z _f3 } box\n{s _f1 _f2 _f1 x _f3  z -_f3 } box\n{ s _f1 _f2 _f1 x -_f3  z _f3} box\n{s _f1 _f2 _f1 x -_f3 z -_f3} box\n\n\n{ s _f2 _f1  _f1  y _f3  z _f3 } box\n{ s _f2 _f1  _f1 y _f3 z -_f3 } box\n{ s _f2 _f1  _f1 y -_f3  z _f3 } box\n{ s _f2 _f1  _f1 y -_f3  z -_f3 } box\n\n{ s _f1 _f1  _f2 y _f3 x _f3 } box\n{ s _f1 _f1  _f2 y _f3  x -_f3 } box\n{ s _f1 _f1  _f2 y -_f3  x _f3 } box\n{ s _f1 _f1  _f2 y -_f3  x -_f3} box\n\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Torus3",
"src": "set maxobjects 160000\n{ a 1.0  sat 0.5 } grinder \nset background #fff\n\nrule grinder { \n   36 * { rz 5  rz 2 y 0.1   }   36 * { ry 10  rz 3 z 1.2 b 0.99 h 12  } xbox\n} \n\nrule xbox {\n  { s 1.1  } frame\n  { b 0.7  color #eee   a 1.0  }  box\n}\n\nrule xbox {\n { s 1.1    } frame\n { b 0.7  color #fff  a 1.0    } box\n}\n\n#define _f3 10\n#define _f1 0.05\n#define _f2 1.05\n\nrule frame  {\n{ s _f1 _f2 _f1  x _f3  z _f3 } box\n{s _f1 _f2 _f1 x _f3  z -_f3 } box\n{ s _f1 _f2 _f1 x -_f3  z _f3} box\n{s _f1 _f2 _f1 x -_f3 z -_f3} box\n\n\n{ s _f2 _f1  _f1  y _f3  z _f3 } box\n{ s _f2 _f1  _f1 y _f3 z -_f3 } box\n{ s _f2 _f1  _f1 y -_f3  z _f3 } box\n{ s _f2 _f1  _f1 y -_f3  z -_f3 } box\n\n{ s _f1 _f1  _f2 y _f3 x _f3 } box\n{ s _f1 _f1  _f2 y _f3  x -_f3 } box\n{ s _f1 _f1  _f2 y -_f3  x _f3 } box\n{ s _f1 _f1  _f2 y -_f3  x -_f3} box\n\n}",
"group": "Structure Synth 1.5.0"
},
{
"name": "Trees 3d",
"src": "\nset background white\n\n{ h 30 sat 0.7 } seed\n{ ry 180 h 30 sat 0.7 } seed\n \nrule seed weight 100 { \n  box   \n  { y 0.4 rx 1 s 0.995 b 0.995 } seed\n}\n\nrule seed weight 100 { \n  box   \n  { y 0.4 rx 1 ry 1 s 0.995 b 0.995 } seed\n}\n\nrule seed weight 100 { \n  box   \n  { y 0.4 rx 1 rz -1 s 0.995 b 0.995 } seed\n}\n\nrule seed weight 6 {  \n  { rx 15 }  seed\n  { ry 180 h 3  }  seed\n} \n",
"group": "Structure Synth 1.5.0"
}
]);
