/** Wide-screen reading layout: the text column fills the reader, the type size and caps step up on very wide readers. */
export const WIDE_CLASS='gloss-wide';
/** Wide mode starts using the available width here; below it the default layout is untouched. */
export const WIDE_MIN_WIDTH=1200;
/** Above this the wide column values (wider number gutter and margin column) take over. */
export const WIDE_COLUMNS_WIDTH=1440;
/** The reading rail column; shared by every layout so band widths stay comparable. */
export const RAIL_COL=28;
/** Reader grid side padding in styles.css (`padding:60px 24px 110px`). */
export const GRID_PAD=24;
export interface ReadingLayout{measureMult:number;measureMax:number;gutterCol:number;noteGap:number;marginCol:number;readScale:number;noteScale:number}
/** The current layout: one text column at the user's character measure, 340px margin column. */
export const DEFAULT_READING_LAYOUT:ReadingLayout={measureMult:1,measureMax:800,gutterCol:68,noteGap:56,marginCol:340,readScale:1,noteScale:1};
/** Wide mode on a regular wide display: more characters per line and a roomier margin column. */
export const WIDE_READING_LAYOUT:ReadingLayout={measureMult:1.8,measureMax:1120,gutterCol:84,noteGap:72,marginCol:460,readScale:1,noteScale:1};
/** Wider displays: the type grows with the column, so the line keeps 50-60 characters. */
export const WIDE_STEPS:{minWidth:number;layout:ReadingLayout}[]=[
 {minWidth:2200,layout:{measureMult:1.8,measureMax:1400,gutterCol:100,noteGap:88,marginCol:540,readScale:1.25,noteScale:1.15}},
 {minWidth:2760,layout:{measureMult:1.85,measureMax:1856,gutterCol:120,noteGap:112,marginCol:600,readScale:1.6,noteScale:1.3}},
];
export function readingLayout(wide:boolean):ReadingLayout{return wide?WIDE_READING_LAYOUT:DEFAULT_READING_LAYOUT;}
/** Resolve the type size and the column caps for a reader width; the text width itself comes from availableTextWidth. */
export function readingLayoutFor(wide:boolean,containerWidth:number):ReadingLayout{
 if(!wide||!(containerWidth>=WIDE_MIN_WIDTH))return DEFAULT_READING_LAYOUT;
 let layout=containerWidth>=WIDE_COLUMNS_WIDTH?WIDE_READING_LAYOUT:DEFAULT_READING_LAYOUT;
 for(const step of WIDE_STEPS)if(containerWidth>=step.minWidth)layout=step.layout;
 return layout;
}
/** Wide mode fills the reader: the text takes what is left after the fixed columns and the side padding. */
export function availableTextWidth(containerWidth:number,layout:ReadingLayout,hasMargin:boolean,railCol=RAIL_COL):number{
 const margin=hasMargin?layout.marginCol:0,gap=hasMargin?layout.noteGap:0;
 return Math.max(0,Math.min(layout.measureMax,containerWidth-GRID_PAD*2-railCol-layout.gutterCol-gap-margin));
}
/** The text column the reader actually gets: wide mode only past WIDE_MIN_WIDTH, otherwise the character measure. */
export function resolvedTextWidth(wide:boolean,containerWidth:number,layout:ReadingLayout,hasMargin:boolean,baseSize:number,measureK:number,railCol=RAIL_COL):number{
 if(!wide||!(containerWidth>=WIDE_MIN_WIDTH))return measureWidth(layout,baseSize,measureK);
 return availableTextWidth(containerWidth,layout,hasMargin,railCol);
}
export function effectiveReadSize(layout:ReadingLayout,baseSize:number):number{return baseSize*layout.readScale;}
/** The text column width in pixels for the default layout, mirroring the base `--m` expression in styles.css. */
export function measureWidth(layout:ReadingLayout,baseSize:number,measureK:number):number{
 return Math.min(layout.measureMax,effectiveReadSize(layout,baseSize)*measureK*layout.measureMult);
}
/** Characters per line at the resolved type size. */
export function lineCharacters(layout:ReadingLayout,baseSize:number,measureK:number):number{
 return measureWidth(layout,baseSize,measureK)/effectiveReadSize(layout,baseSize);
}
/** The whole reading band: rail, number gutter, text column, then the gap and margin column when notes exist. */
export function bandWidth(layout:ReadingLayout,textWidth:number,hasMargin=true,railCol=RAIL_COL):number{
 return railCol+layout.gutterCol+textWidth+(hasMargin?layout.noteGap+layout.marginCol:0);
}
export function layoutVariables(layout:ReadingLayout):Record<string,string>{
 return{'--measure-mult':String(layout.measureMult),'--m-max':layout.measureMax+'px','--gutter-col':layout.gutterCol+'px','--note-gap':layout.noteGap+'px','--margin-col':layout.marginCol+'px','--read-scale':String(layout.readScale),'--note-scale':String(layout.noteScale)};
}
export interface LayoutTarget{toggleClass(name:string,value:boolean):void;style:{setProperty(name:string,value:string):void}}
/** Write the default layout variables and toggle the wide-screen class; the wide values live in styles.css. */
export function applyReadingLayout(root:LayoutTarget,wide:boolean){
 root.toggleClass(WIDE_CLASS,wide);
 const variables=layoutVariables(DEFAULT_READING_LAYOUT);
 for(const[name,value]of Object.entries(variables))root.style.setProperty(name,value);
}
