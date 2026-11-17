using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("轻语酒馆")]
[assembly: AssemblyProduct("轻语酒馆")]
[assembly: AssemblyDescription("轻语酒馆 - 极简角色卡 × 世界书聊天")]
[assembly: AssemblyVersion("1.6.6.0")]
[assembly: AssemblyFileVersion("1.6.6.0")]

static class Program
{
    private const string AppVersion = "1.6.6";

    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
        }
        catch { }

        string baseDir;
        try
        {
            baseDir = ResolveBaseDirectory();
        }
        catch (Exception ex)
        {
            MessageBox.Show("无法创建应用目录：\r\n" + ex.Message,
                "轻语酒馆", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        // A previous in-app update renamed the old launcher to "<name>.old" and
        // dropped the replacement in its place; clean that copy up now.
        CleanupStaleBackup();

        string root = Path.Combine(baseDir, AppVersion);
        string exe = Path.Combine(root, "LiteTavern.exe");

        // Marks the folder as a portable install. The unpacked LiteTavern.exe
        // reads this marker on startup and keeps using <baseDir>\UserData, so a
        // direct double-click shows the same cards as the launcher.
        try
        {
            File.WriteAllText(Path.Combine(baseDir, ".lite-tavern-portable"), AppVersion);
        }
        catch { }

        if (!File.Exists(exe))
        {
            SplashForm splash = null;
            try
            {
                splash = new SplashForm();
                splash.Show();
                splash.Refresh();
                Application.DoEvents();
            }
            catch
            {
                splash = null;
            }

            try
            {
                Extract(root);
            }
            catch (Exception ex)
            {
                try
                {
                    MessageBox.Show(
                        "首次启动解压失败：" + ex.Message + "\r\n\r\n" +
                        "写入目录：" + baseDir,
                        "轻语酒馆", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                catch { }
                return;
            }
            finally
            {
                if (splash != null)
                {
                    try { splash.Close(); } catch { }
                }
            }

            if (!File.Exists(exe))
            {
                return;
            }
        }

        try
        {
            ProcessStartInfo info = new ProcessStartInfo(exe);
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            string userData = Path.Combine(baseDir, "UserData");
            Directory.CreateDirectory(userData);
            info.EnvironmentVariables["LITE_TAVERN_USER_DATA"] = userData;
            // The in-app updater swaps this launcher for the new release and
            // restarts it, so the app has to know both paths.
            info.EnvironmentVariables["LITE_TAVERN_LAUNCHER"] = Application.ExecutablePath;
            info.EnvironmentVariables["LITE_TAVERN_HOME"] = baseDir;

            List<string> allArgs = new List<string>();
            allArgs.Add("--no-sandbox");
            if (args != null)
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] != "--no-sandbox") allArgs.Add(args[i]);
                }
            }
            string[] quoted = new string[allArgs.Count];
            for (int i = 0; i < allArgs.Count; i++)
            {
                quoted[i] = "\"" + allArgs[i].Replace("\"", "\\\"") + "\"";
            }
            info.Arguments = string.Join(" ", quoted);
            Process.Start(info);
        }
        catch (Exception ex)
        {
            MessageBox.Show("无法启动轻语酒馆：\r\n" + ex.Message,
                "轻语酒馆", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string ResolveBaseDirectory()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
        string[] candidates = new string[]
        {
            Path.Combine(local, "LiteTavern"),
            Path.Combine(roaming, "LiteTavern"),
            Path.Combine(exeDir, "LiteTavernData")
        };

        // Reuse whichever location already holds an install (any version), so an
        // upgrade does not silently strand the user's cards in another folder.
        for (int i = 0; i < candidates.Length; i++)
        {
            if (HasInstalledVersion(candidates[i]))
            {
                return candidates[i];
            }
        }

        Exception last = null;
        for (int i = 0; i < candidates.Length; i++)
        {
            try
            {
                Directory.CreateDirectory(candidates[i]);
                string probe = Path.Combine(candidates[i], ".write-test");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return candidates[i];
            }
            catch (Exception ex)
            {
                last = ex;
            }
        }
        throw new Exception("没有可写目录。最后错误：" + (last == null ? "未知" : last.Message));
    }

    /// <summary>
    /// Deletes the "&lt;launcher&gt;.old" copy that an in-app update leaves behind.
    /// </summary>
    private static void CleanupStaleBackup()
    {
        try
        {
            string stale = Application.ExecutablePath + ".old";
            if (File.Exists(stale)) File.Delete(stale);
        }
        catch { }
    }

    private static bool HasInstalledVersion(string baseDir)
    {        try
        {
            if (!Directory.Exists(baseDir)) return false;
            foreach (string dir in Directory.GetDirectories(baseDir))
            {
                if (File.Exists(Path.Combine(dir, "LiteTavern.exe"))) return true;
            }
        }
        catch { }
        return false;
    }

    private static void Extract(string root)
    {
        string parent = Path.GetDirectoryName(root);
        Directory.CreateDirectory(parent);

        string staging = root + ".tmp-" + Guid.NewGuid().ToString("N");
        if (Directory.Exists(staging)) Directory.Delete(staging, true);
        Directory.CreateDirectory(staging);

        Assembly assembly = Assembly.GetExecutingAssembly();
        using (Stream stream = assembly.GetManifestResourceStream("LiteTavern.app.zip"))
        {
            if (stream == null) throw new Exception("内置应用资源缺失。");
            using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    string destination = Path.GetFullPath(Path.Combine(staging, relative));
                    string stagingRoot = Path.GetFullPath(staging);
                    if (!destination.StartsWith(stagingRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new Exception("内置压缩包包含非法路径。");
                    }
                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destination);
                    }
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(destination));
                        entry.ExtractToFile(destination, true);
                    }
                }
            }
        }

        File.WriteAllText(Path.Combine(staging, ".ready"), DateTime.UtcNow.ToString("o"));

        if (Directory.Exists(root))
        {
            Directory.Delete(root, true);
        }
        Directory.Move(staging, root);
    }
}

internal sealed class SplashForm : Form
{
    public SplashForm()
    {
        Text = "轻语酒馆";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(390, 138);
        BackColor = Color.FromArgb(23, 19, 16);
        ShowInTaskbar = false;
        TopMost = true;

        Label title = new Label();
        title.Text = "轻语酒馆";
        title.ForeColor = Color.FromArgb(231, 181, 120);
        title.Font = new Font("Microsoft YaHei", 15F, FontStyle.Bold);
        title.AutoSize = true;
        title.Location = new Point(28, 24);
        Controls.Add(title);

        Label subtitle = new Label();
        subtitle.Text = "首次启动，正在准备角色卡与世界书…";
        subtitle.ForeColor = Color.FromArgb(150, 135, 122);
        subtitle.Font = new Font("Microsoft YaHei", 9F);
        subtitle.AutoSize = true;
        subtitle.Location = new Point(31, 66);
        Controls.Add(subtitle);

        ProgressBar bar = new ProgressBar();
        bar.Style = ProgressBarStyle.Marquee;
        bar.MarqueeAnimationSpeed = 28;
        bar.Location = new Point(31, 98);
        bar.Size = new Size(328, 7);
        Controls.Add(bar);

        Label hint = new Label();
        hint.Text = "解压到本机 AppData，不会写入系统临时目录";
        hint.ForeColor = Color.FromArgb(105, 94, 84);
        hint.Font = new Font("Microsoft YaHei", 7.5F);
        hint.AutoSize = true;
        hint.Location = new Point(31, 114);
        Controls.Add(hint);
    }
}
