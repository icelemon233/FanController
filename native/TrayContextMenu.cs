using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CinnaFanCon
{
    // Keep the native drop-down's focus, keyboard navigation, monitor placement
    // and outside-click dismissal while replacing its legacy presentation.
    public sealed class TrayContextMenu : ContextMenuStrip
    {
        [DllImport("dwmapi.dll")]private static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
        [DllImport("user32.dll")]private static extern uint GetDpiForWindow(IntPtr window);
        private readonly MenuRenderer painter;
        private readonly WindowFrameContract metrics=WindowFrameContract.Load();
        private Font menuFont;
        private float scale=1;
        private bool dark,highContrast;
        private bool? preferredDark;
        private Color surface,ink,hover,border,muted;
        private static bool Windows11 {get{return Environment.OSVersion.Version.Build>=22000;}}

        public TrayContextMenu(Action open,Action release,Action exit)
        {
            ShowImageMargin=false;ShowCheckMargin=false;ShowItemToolTips=false;
            DropShadowEnabled=true;AutoSize=false;
            painter=new MenuRenderer(this);Renderer=painter;
            Items.Add(CreateItem("打开 FanController","tray-open",0,open));
            Items.Add(CreateItem("恢复所有风扇原设置","tray-release",1,release));
            Items.Add(new ToolStripSeparator {AutoSize=false,Margin=Padding.Empty});
            Items.Add(CreateItem("恢复原设置并退出","tray-exit",2,exit));
            ApplyAppearance(SystemDark(),96);
        }
        private ToolStripMenuItem CreateItem(string text,string name,int glyph,Action action)
        {
            var item=new ToolStripMenuItem(text){Name=name,Tag=glyph,AutoSize=false,Margin=Padding.Empty,Padding=Padding.Empty};
            item.Click+=delegate{action();};return item;
        }
        protected override CreateParams CreateParams
        {
            get
            {
                var parameters=base.CreateParams;
                // A thin native frame lets DWM supply Windows 11's actual
                // rounded corners and shadow, without a layered fake window.
                if(Windows11)parameters.Style|=0x00800000;
                return parameters;
            }
        }
        protected override Padding DefaultPadding {get{return new Padding(Pixels(4));}}
        protected override void OnOpening(CancelEventArgs e)
        {
            uint dpi=96;try{dpi=GetDpiForWindow(Handle);}catch(EntryPointNotFoundException){ }
            ApplyAppearance(preferredDark??SystemDark(),(int)dpi);base.OnOpening(e);
        }
        protected override void OnOpened(EventArgs e)
        {
            RefreshDisplayDpi();ApplyWindowFrame();base.OnOpened(e);
        }
        protected override void WndProc(ref Message message)
        {
            base.WndProc(ref message);
            if(message.Msg==0x02E0&&painter!=null)RefreshDisplayDpi();
        }
        private void RefreshDisplayDpi()
        {
            try
            {
                int dpi=(int)GetDpiForWindow(Handle);
                if(dpi>0&&Math.Abs(scale-dpi/96f)>.01f)ApplyAppearance(preferredDark??SystemDark(),dpi);
                var area=Screen.FromHandle(Handle).WorkingArea;
                Location=new Point(Math.Max(area.Left,Math.Min(Left,area.Right-Width)),Math.Max(area.Top,Math.Min(Top,area.Bottom-Height)));
            }
            catch(EntryPointNotFoundException){ }
        }
        protected override void OnSizeChanged(EventArgs e){base.OnSizeChanged(e);ApplyWindowFrame();}
        private static bool SystemDark()
        {
            try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))return key!=null&&Convert.ToInt32(key.GetValue("AppsUseLightTheme",1))==0;}
            catch{return false;}
        }
        internal int Pixels(float value){return (int)Math.Round(value*scale);}
        internal void SetTheme(bool useDark)
        {
            preferredDark=useDark;ApplyAppearance(useDark,(int)Math.Round(scale*96));
        }
        internal void ApplyAppearance(bool useDark,int dpi)
        {
            dark=useDark;highContrast=SystemInformation.HighContrast;scale=Math.Max(1,dpi/96f);
            surface=highContrast?SystemColors.Menu:dark?Color.FromArgb(36,39,43):Color.White;
            ink=highContrast?SystemColors.MenuText:dark?Color.FromArgb(242,239,234):Color.FromArgb(70,51,42);
            hover=highContrast?SystemColors.Highlight:dark?Color.FromArgb(48,52,58):Color.FromArgb(232,231,226);
            border=highContrast?SystemColors.WindowText:dark?Color.FromArgb(59,65,71):Color.FromArgb(228,226,221);
            muted=highContrast?SystemColors.GrayText:dark?Color.FromArgb(184,178,170):Color.FromArgb(112,105,96);
            // Pixel fonts avoid WinForms' legacy primary-monitor font scaling
            // when this WPF-hosted menu moves between displays with different DPI.
            float fontSize=Math.Max(14,SystemFonts.MenuFont.SizeInPoints*96/72)*scale;
            if(menuFont==null||Math.Abs(menuFont.Size-fontSize)>.01f)
            {
                var previous=menuFont;menuFont=new Font("Segoe UI",fontSize,FontStyle.Regular,GraphicsUnit.Pixel);Font=menuFont;if(previous!=null)previous.Dispose();
            }
            BackColor=surface;ForeColor=ink;Padding=new Padding(Pixels(metrics.Controls.MenuInset));
            ClientSize=new Size(Pixels(256),Pixels(metrics.Controls.MenuInset*2+metrics.Controls.MenuItemHeight*3+9));
            foreach(ToolStripItem item in Items)item.Size=new Size(ClientSize.Width-Padding.Horizontal,Pixels(item is ToolStripSeparator?9:metrics.Controls.MenuItemHeight));
            PerformLayout();ApplyWindowFrame();Invalidate(true);
        }
        private void ApplyWindowFrame()
        {
            if(!IsHandleCreated||!Windows11)return;
            int corners=2,theme=dark?1:0,frame=border.R|(border.G<<8)|(border.B<<16);
            try
            {
                DwmSetWindowAttribute(Handle,33,ref corners,sizeof(int));
                DwmSetWindowAttribute(Handle,20,ref theme,sizeof(int));
                DwmSetWindowAttribute(Handle,34,ref frame,sizeof(int));
            }
            catch(DllNotFoundException){ }
            catch(EntryPointNotFoundException){ }
        }
        protected override void Dispose(bool disposing){base.Dispose(disposing);if(disposing&&menuFont!=null){menuFont.Dispose();menuFont=null;}}

        private sealed class MenuRenderer : ToolStripRenderer
        {
            private readonly TrayContextMenu menu;
            public MenuRenderer(TrayContextMenu owner){menu=owner;}
            protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e){using(var brush=new SolidBrush(menu.surface))e.Graphics.FillRectangle(brush,e.AffectedBounds);}
            protected override void OnRenderImageMargin(ToolStripRenderEventArgs e){ }
            protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
            {
                // DWM draws the native frame on Windows 11. Keep a simple
                // hairline fallback on earlier Windows versions.
                if(Windows11)return;
                using(var pen=new Pen(menu.border))e.Graphics.DrawRectangle(pen,0,0,e.ToolStrip.Width-1,e.ToolStrip.Height-1);
            }
            protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
            {
                if(!e.Item.Selected||!e.Item.Enabled)return;
                e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
                var bounds=new Rectangle(0,0,e.Item.Width-1,e.Item.Height-1);
                using(var path=Round(bounds,menu.Pixels(menu.metrics.Controls.Radius)))using(var brush=new SolidBrush(menu.hover))e.Graphics.FillPath(brush,path);
            }
            protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
            {
                Color color=!e.Item.Enabled?menu.muted:menu.highContrast&&e.Item.Selected?SystemColors.HighlightText:menu.ink;
                int left=menu.Pixels(12+menu.metrics.Sidebar.Size+8);
                var bounds=new Rectangle(left,0,e.Item.Width-left-menu.Pixels(12),e.Item.Height);
                TextRenderer.DrawText(e.Graphics,e.Text,e.TextFont,bounds,color,TextFormatFlags.Left|TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix|TextFormatFlags.NoPadding);
                int icon=menu.Pixels(menu.metrics.Sidebar.Size);
                DrawGlyph(e.Graphics,(int)e.Item.Tag,new Rectangle(menu.Pixels(12),(e.Item.Height-icon)/2,icon,icon),color,menu.metrics.Sidebar.Stroke);
            }
            protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
            {
                using(var pen=new Pen(menu.border))e.Graphics.DrawLine(pen,menu.Pixels(16),e.Item.Height/2,e.Item.Width-menu.Pixels(16),e.Item.Height/2);
            }
            private static GraphicsPath Round(Rectangle bounds,int radius)
            {
                int size=radius*2;var path=new GraphicsPath();
                path.AddArc(bounds.Left,bounds.Top,size,size,180,90);path.AddArc(bounds.Right-size,bounds.Top,size,size,270,90);
                path.AddArc(bounds.Right-size,bounds.Bottom-size,size,size,0,90);path.AddArc(bounds.Left,bounds.Bottom-size,size,size,90,90);path.CloseFigure();return path;
            }
            // Lucide app-window / rotate-ccw / power; ISC/MIT notices are in
            // third-party/Lucide-LICENSE.txt. Use the same 24-unit geometry.
            private static readonly string[] Glyphs={
                "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M10 4v4 M2 8h20 M6 4v4",
                "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5",
                "M12 2v10 M18.4 6.6a9 9 0 1 1-12.77.04"
            };
            private static void DrawGlyph(Graphics graphics,int glyph,Rectangle bounds,Color color,float stroke)
            {
                var state=graphics.Save();graphics.TranslateTransform(bounds.X,bounds.Y);graphics.ScaleTransform(bounds.Width/24f,bounds.Height/24f);graphics.SmoothingMode=SmoothingMode.AntiAlias;
                using(var pen=new Pen(color,stroke){StartCap=LineCap.Round,EndCap=LineCap.Round,LineJoin=LineJoin.Round})
                using(var path=new GraphicsPath())
                {
                    var geometry=System.Windows.Media.Geometry.Parse(Glyphs[glyph]).GetFlattenedPathGeometry(.01,System.Windows.Media.ToleranceType.Absolute);
                    foreach(var figure in geometry.Figures)
                    {
                        var points=new System.Collections.Generic.List<PointF>{new PointF((float)figure.StartPoint.X,(float)figure.StartPoint.Y)};
                        foreach(var segment in figure.Segments)
                        {
                            var line=segment as System.Windows.Media.LineSegment;
                            if(line!=null)points.Add(new PointF((float)line.Point.X,(float)line.Point.Y));
                            var lines=segment as System.Windows.Media.PolyLineSegment;
                            if(lines!=null)foreach(var point in lines.Points)points.Add(new PointF((float)point.X,(float)point.Y));
                        }
                        path.StartFigure();if(points.Count>1)path.AddLines(points.ToArray());if(figure.IsClosed)path.CloseFigure();
                    }
                    graphics.DrawPath(pen,path);
                }
                graphics.Restore(state);
            }
        }
    }
}
