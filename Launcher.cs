using System;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.IO;

namespace LakeLogicLauncher
{
    public class LauncherForm : Form
    {
        private Button btnStart;
        private Button btnStop;
        private Label lblTitle;
        private Label lblStatus;
        private Process serverProcess;
        
        // Define paths
        private string serverExePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin", "ServerEngine.exe");
        private int serverPort = 3000;

        public LauncherForm()
        {
            InitializeComponent();
            LoadIcon();
        }

        private void InitializeComponent()
        {
            this.Text = "LakeLogic Launcher";
            this.Size = new Size(380, 220);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = ColorTranslator.FromHtml("#0D1626");

            lblTitle = new Label();
            lblTitle.Text = "LakeLogic Minnesota";
            lblTitle.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.AutoSize = true;
            lblTitle.Location = new Point(20, 20);
            this.Controls.Add(lblTitle);

            lblStatus = new Label();
            lblStatus.Text = "Status: Stopped";
            lblStatus.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            lblStatus.ForeColor = ColorTranslator.FromHtml("#FCA5A5"); // pastel red
            lblStatus.AutoSize = true;
            lblStatus.Location = new Point(22, 55);
            this.Controls.Add(lblStatus);

            btnStart = new Button();
            btnStart.Text = "► Start Server";
            btnStart.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            btnStart.Size = new Size(150, 45);
            btnStart.Location = new Point(20, 100);
            btnStart.BackColor = ColorTranslator.FromHtml("#1AB8A8");
            btnStart.ForeColor = Color.White;
            btnStart.FlatStyle = FlatStyle.Flat;
            btnStart.FlatAppearance.BorderSize = 0;
            btnStart.Cursor = Cursors.Hand;
            btnStart.Click += BtnStart_Click;
            this.Controls.Add(btnStart);

            btnStop = new Button();
            btnStop.Text = "■ Stop Server";
            btnStop.Font = new Font("Segoe UI", 11, FontStyle.Bold);
            btnStop.Size = new Size(150, 45);
            btnStop.Location = new Point(180, 100);
            btnStop.BackColor = Color.Gray;
            btnStop.ForeColor = Color.White;
            btnStop.FlatStyle = FlatStyle.Flat;
            btnStop.FlatAppearance.BorderSize = 0;
            btnStop.Enabled = false;
            btnStop.Cursor = Cursors.Hand;
            btnStop.Click += BtnStop_Click;
            this.Controls.Add(btnStop);

            this.FormClosing += LauncherForm_FormClosing;
        }
        
        private void LoadIcon()
        {
            try
            {
                // Attempt to load logo from bin/public if we have it or adjacent
                string logoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin", "logo_notext.png");
                if (File.Exists(logoPath)) {
                    Bitmap bmp = new Bitmap(logoPath);
                    this.Icon = Icon.FromHandle(bmp.GetHicon());
                }
            }
            catch { /* Ignore icon loading errors */ }
        }

        private void BtnStart_Click(object sender, EventArgs e)
        {
            if (!File.Exists(serverExePath))
            {
                MessageBox.Show("Could not find ServerEngine.exe inside the 'bin' folder.\nMake sure the folder structure is intact.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            lblStatus.Text = "Status: Starting server...";
            lblStatus.ForeColor = ColorTranslator.FromHtml("#F59E0B"); // Yellow
            this.Refresh();

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = serverExePath;
                psi.WorkingDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true; // HIDES THE CONSOLE WINDOW!

                serverProcess = Process.Start(psi);

                // Give it a moment to bind the port
                System.Threading.Thread.Sleep(1500);

                lblStatus.Text = "Status: Running on Port " + serverPort;
                lblStatus.ForeColor = ColorTranslator.FromHtml("#4ADE80"); // Green

                btnStart.Enabled = false;
                btnStart.BackColor = Color.Gray;
                btnStop.Enabled = true;
                btnStop.BackColor = ColorTranslator.FromHtml("#F87171");

                // Open Default Browser
                Process.Start(new ProcessStartInfo("http://localhost:" + serverPort) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch LakeLogic server.\n\n" + ex.Message, "Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                lblStatus.Text = "Status: Error starting";
                lblStatus.ForeColor = ColorTranslator.FromHtml("#F87171");
            }
        }

        private void BtnStop_Click(object sender, EventArgs e)
        {
            StopServer();
        }

        private void StopServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try {
                    serverProcess.Kill();
                    serverProcess.WaitForExit();
                } catch { }
            }
            
            // Safety fallback
            try {
                Process.Start(new ProcessStartInfo("taskkill", "/f /im ServerEngine.exe") { CreateNoWindow = true, UseShellExecute = false });
            } catch { }

            serverProcess = null;

            lblStatus.Text = "Status: Stopped";
            lblStatus.ForeColor = ColorTranslator.FromHtml("#FCA5A5");

            btnStop.Enabled = false;
            btnStop.BackColor = Color.Gray;

            btnStart.Enabled = true;
            btnStart.BackColor = ColorTranslator.FromHtml("#1AB8A8");
        }

        private void LauncherForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            StopServer();
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }
}
