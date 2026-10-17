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
        private Font menuFont;
        private float scale=1;
        private bool dark,highContrast;
        private Color surface,ink,hover,border,muted;
        private static bool Windows11 {get{return Environment.OSVersion.Version.Build>=22000;}}

        public TrayContextMenu(Action open,Action release,Action exit)
        {
            ShowImageMargin=false;ShowCheckMargin=false;ShowItemToolTips=false;
            DropShadowEnabled=true;AutoSize=false;
            painter=new MenuRenderer(this);Renderer=painter;
            Items.Add(CreateItem("打开 cinna-fanCon","tray-open",0,open));
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
            ApplyAppearance(SystemDark(),(int)dpi);base.OnOpening(e);
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
                if(dpi>0&&Math.Abs(scale-dpi/96f)>.01f)ApplyAppearance(SystemDark(),dpi);
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
        internal void ApplyAppearance(bool useDark,int dpi)
        {
            dark=useDark;highContrast=SystemInformation.HighContrast;scale=Math.Max(1,dpi/96f);
            surface=highContrast?SystemColors.Menu:dark?Color.FromArgb(44,44,44):Color.FromArgb(249,249,249);
            ink=highContrast?SystemColors.MenuText:dark?Color.FromArgb(242,242,242):Color.FromArgb(27,27,27);
            hover=highContrast?SystemColors.Highlight:dark?Color.FromArgb(61,61,61):Color.FromArgb(235,235,235);
            border=highContrast?SystemColors.WindowText:dark?Color.FromArgb(70,70,70):Color.FromArgb(216,216,216);
            muted=highContrast?SystemColors.GrayText:dark?Color.FromArgb(145,145,145):Color.FromArgb(120,120,120);
            // Pixel fonts avoid WinForms' legacy primary-monitor font scaling
            // when this WPF-hosted menu moves between displays with different DPI.
            float fontSize=Math.Max(14,SystemFonts.MenuFont.SizeInPoints*96/72)*scale;
            if(menuFont==null||Math.Abs(menuFont.Size-fontSize)>.01f)
            {
                var previous=menuFont;menuFont=new Font("Segoe UI",fontSize,FontStyle.Regular,GraphicsUnit.Pixel);Font=menuFont;if(previous!=null)previous.Dispose();
            }
            BackColor=surface;ForeColor=ink;Padding=new Padding(Pixels(4));
            ClientSize=new Size(Pixels(256),Pixels(125));
            foreach(ToolStripItem item in Items)item.Size=new Size(ClientSize.Width,Pixels(item is ToolStripSeparator?9:36));
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
                int inset=menu.Pixels(4);
                var bounds=new Rectangle(inset,0,e.Item.Width-inset*2-1,e.Item.Height-1);
                using(var path=Round(bounds,menu.Pixels(4)))using(var brush=new SolidBrush(menu.hover))e.Graphics.FillPath(brush,path);
            }
            protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
            {
                Color color=!e.Item.Enabled?menu.muted:menu.highContrast&&e.Item.Selected?SystemColors.HighlightText:menu.ink;
                int left=menu.Pixels(44);
                var bounds=new Rectangle(left,0,e.Item.Width-left-menu.Pixels(12),e.Item.Height);
                TextRenderer.DrawText(e.Graphics,e.Text,e.TextFont,bounds,color,TextFormatFlags.Left|TextFormatFlags.VerticalCenter|TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix|TextFormatFlags.NoPadding);
                DrawGlyph(e.Graphics,(int)e.Item.Tag,new Rectangle(menu.Pixels(16),(e.Item.Height-menu.Pixels(16))/2,menu.Pixels(16),menu.Pixels(16)),color);
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
            private static void DrawGlyph(Graphics graphics,int glyph,Rectangle bounds,Color color)
            {
                var state=graphics.Save();graphics.TranslateTransform(bounds.X,bounds.Y);graphics.ScaleTransform(bounds.Width/16f,bounds.Height/16f);graphics.SmoothingMode=SmoothingMode.AntiAlias;
                using(var pen=new Pen(color,1.2f){StartCap=LineCap.Round,EndCap=LineCap.Round,LineJoin=LineJoin.Round})
                {
                    if(glyph==0){graphics.DrawRectangle(pen,2.5f,3.5f,11,9);graphics.DrawLine(pen,2.5f,6.5f,13.5f,6.5f);}
                    else if(glyph==1){graphics.DrawArc(pen,2.5f,2.5f,11,11,205,290);graphics.DrawLines(pen,new[]{new PointF(2.5f,2),new PointF(2.5f,6),new PointF(6.5f,6)});}
                    else{graphics.DrawArc(pen,2.5f,3,11,10.5f,-45,270);graphics.DrawLine(pen,8,1.5f,8,7.5f);}
                }
                graphics.Restore(state);
            }
        }
    }
}
