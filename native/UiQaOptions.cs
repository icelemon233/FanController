using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace CinnaFanCon
{
    // Accepted only alongside --ui-qa. These options never enable hardware,
    // install anything or change the production WebView origin/bridge.
    public sealed class UiQaOptions
    {
        public double? Width,Height;
        public string Theme,Page,Profile;
        public bool? Pinned;
        public string Root {get{return Path.Combine(Environment.CurrentDirectory,"work","ui-qa",Profile);}}
        public string Cache {get{return Path.Combine(Root,"webview-v2");}}
        public string MetricsPath {get{return Path.Combine(Root,"window-shell-metrics.json");}}
        public string ThemePath {get{return Path.Combine(Root,"theme.preference");}}

        public static UiQaOptions Parse(string[] args)
        {
            if(!args.Contains("--ui-qa"))return null;
            var value=new UiQaOptions {Profile="session-"+Process.GetCurrentProcess().Id};
            foreach(string argument in args.Where(a=>a.StartsWith("--qa-",StringComparison.Ordinal)))
            {
                int separator=argument.IndexOf('=');
                if(separator<0)throw new ArgumentException("UI QA options use --qa-name=value.");
                string name=argument.Substring(5,separator-5),text=argument.Substring(separator+1);
                switch(name)
                {
                    case "width":value.Width=Dimension(text,920,2560);break;
                    case "height":value.Height=Dimension(text,660,1800);break;
                    case "theme":
                        if(text!="dark"&&text!="light"&&text!="system")throw new ArgumentException("Unknown QA theme.");
                        value.Theme=text;break;
                    case "page":
                        if(text!="home"&&text!="devices"&&text!="settings")throw new ArgumentException("Unknown QA page.");
                        value.Page=text;break;
                    case "pinned":
                        if(text!="true"&&text!="false")throw new ArgumentException("QA pinned must be true or false.");
                        value.Pinned=text=="true";break;
                    case "profile":
                        if(!Regex.IsMatch(text,@"\A[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}\z"))throw new ArgumentException("QA profile must be a short directory name.");
                        value.Profile=text;break;
                    default:throw new ArgumentException("Unknown UI QA option: "+name);
                }
            }
            return value;
        }
        private static double Dimension(string text,double minimum,double maximum)
        {
            double value;
            if(!double.TryParse(text,NumberStyles.None,CultureInfo.InvariantCulture,out value)||value<minimum||value>maximum)
                throw new ArgumentException("QA window dimension is outside the supported DIP range.");
            return value;
        }
        public bool InitialDark(bool systemDark)
        {
            string theme=Theme;
            if(theme==null)try{if(File.Exists(ThemePath))theme=File.ReadAllText(ThemePath);}catch{ }
            return theme=="dark"||(theme!="light"&&systemDark);
        }
        public string BootstrapScript()
        {
            string script="window.__fanControllerUiQa={page:'"+(Page??"home")+"'};";
            if(Theme!=null)script+="localStorage.setItem('cinna-fancon-theme','"+Theme+"');";
            if(Pinned.HasValue)script+="localStorage.setItem('cinna-fancon-navigation','"+(Pinned.Value?"expanded":"collapsed")+"');";
            return script;
        }
    }
}
