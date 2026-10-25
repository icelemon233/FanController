using System;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace CinnaFanCon
{
    [DataContract]
    internal sealed class WindowFrameContract
    {
        [DataMember(Name="titlebar")]public CaptionContract Titlebar {get;set;}
        [DataMember(Name="controls")]public PopupContract Controls {get;set;}
        [DataMember(Name="sidebar")]public NavigationIconContract Sidebar {get;set;}
        internal static WindowFrameContract Load()
        {
            using(var stream=typeof(WindowFrameContract).Assembly.GetManifestResourceStream("CinnaFanCon.WindowShell"))
            {
                if(stream==null)throw new InvalidOperationException("窗口尺寸资源缺失，请重新构建应用。");
                var value=(WindowFrameContract)new DataContractJsonSerializer(typeof(WindowFrameContract)).ReadObject(stream);
                if(value.Titlebar==null||value.Controls==null||value.Sidebar==null||value.Titlebar.Height<32||value.Titlebar.CaptionWidth<32)
                    throw new InvalidOperationException("窗口尺寸资源无效。");
                return value;
            }
        }
    }
    [DataContract]
    internal sealed class CaptionContract
    {
        [DataMember(Name="height")]public double Height {get;set;}
        [DataMember(Name="captionButtonWidth")]public double CaptionWidth {get;set;}
    }
    [DataContract]
    internal sealed class PopupContract
    {
        [DataMember(Name="menuItemHeight")]public int MenuItemHeight {get;set;}
        [DataMember(Name="menuInset")]public int MenuInset {get;set;}
        [DataMember(Name="radius")]public int Radius {get;set;}
    }
    [DataContract]
    internal sealed class NavigationIconContract
    {
        [DataMember(Name="iconSize")]public int Size {get;set;}
        [DataMember(Name="iconStroke")]public float Stroke {get;set;}
    }
}
