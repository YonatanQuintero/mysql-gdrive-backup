# MySQL to Google Drive Backup Script (Node.js)

This script automates the process of backing up MySQL databases, compressing them, uploading them to a specified Google Drive folder, and managing backup retention. It uses `mysqldump` for database dumping, `rclone` for Google Drive interaction, and `node-cron` for scheduling.

## Features

* **Automated MySQL Backups**: Dumps specified MySQL databases or all databases.
* **Gzip Compression**: Compresses backups to save space.
* **Google Drive Upload**: Securely uploads backups to a designated Google Drive folder using `rclone`.
* **Backup Retention**: Keeps a configurable number of recent backups and deletes older ones.
* **Scheduled Execution**: Uses `node-cron` to run backups automatically on a defined schedule.
* **Environment Configuration**: Uses a `.env` file for easy configuration of credentials and paths.

## Prerequisites

Before you begin, ensure you have the following installed on your server (e.g., Debian/Ubuntu VPS):

1.  **Node.js**: Version 14.x or higher recommended.
    ```bash
    node -v
    npm -v
    ```
2.  **MySQL Client (`mysqldump`)**:
    ```bash
    # For Debian/Ubuntu
    sudo apt update && sudo apt install mysql-client -y
    # Verify mysqldump
    mysqldump --version
    ```
3.  **Rclone**: For interacting with Google Drive.
    * Installation instructions are provided below.

## Installation

1.  **Clone the Repository** (or download the script files):
    ```bash
    git clone git@github.com:YonatanQuintero/mysql-gdrive-backup.git
    cd mysql-gdrive-backup

    # If you only have the script file (e.g., app.js), create a project directory:
    mkdir mysql-gdrive-backup
    cd mysql-gdrive-backup
    # Then, place app.js and package.json (if any) in this directory.
    ```

2.  **Install Node.js Dependencies**:
    If you have a `package.json` defining dependencies (`dotenv`, `node-cron`), run:
    ```bash
    npm install
    ```
    If you don't have a `package.json` yet, you can create one (`npm init -y`) and then install the packages:
    ```bash
    npm install dotenv node-cron
    ```

3.  **Create `.gitignore`**:
    Create a `.gitignore` file in your project root to prevent committing sensitive files and `node_modules`:
    ```gitignore
    node_modules/
    .env
    *.log
    ```

## Configuration

Proper configuration is crucial for the script to run correctly. This involves setting up `rclone` to communicate with Google Drive and creating a `.env` file for script-specific settings.

### 1. Rclone Setup (Google Drive with 'drive.file' Scope)

Rclone is a command-line program to manage files on cloud storage. It's used here to transfer backup files to Google Drive.

#### Installing Rclone

The recommended method to install `rclone` on Linux is by using their official installation script:
```bash
curl https://rclone.org/install.sh | sudo bash
```
After installation, verify it by checking the version:
```bash
rclone --version
```

#### Configuring Rclone Remote for Google Drive

You need to configure an `rclone` "remote" that links to your Google Drive account. This script is specifically tailored to work with Google Drive's **Scope 3 (`drive.file`)**, which provides per-file access to files created or opened by rclone.

1.  **Start the `rclone` configuration wizard** on your server:
    ```bash
    rclone config
    ```

2.  **Follow the interactive prompts**:
    * `n` (To create a new remote)
    * **name**: Enter a short name for your remote (e.g., `gdrive`). This name will be used as the `RCLONE_REMOTE` value in your `.env` file.
    * **Storage** / **Type of storage to configure**: A list of cloud services will appear. Find "Google Drive" and enter its corresponding number (e.g., `18` - the number might change depending on your `rclone` version).
    * **client_id**: Press Enter to leave blank (uses rclone's default).
    * **client_secret**: Press Enter to leave blank (uses rclone's default).
    * **scope**: This is a critical step. You will be presented with several access scope options. Choose option **`3`**, which typically corresponds to:
        `drive.file` - Per-file access to files created or opened by rclone. (Allows rclone to upload and download files created by rclone only).
    * `root_folder_id`: Press Enter to leave blank (rclone will use the root of your Google Drive, or the root of the Team Drive if specified later).
    * `service_account_file`: Press Enter to leave blank (not using a service account for this setup).
    * `Edit advanced config? (y/n)`: Type `n` and press Enter.
    * `Use auto config? (y/n)`: Since you are likely on a headless server (like a VPS without a graphical interface), type **`n`** and press Enter.

3.  **Authorize Rclone (Headless Server Method)**:
    After selecting `n` for "Use auto config?", `rclone` will display instructions for authorizing on a machine with a web browser. It will look something like this:
    ```
    For this to work, you will need rclone available on a machine that has a web browser available.
    Execute the following on the machine with the web browser (same rclone version recommended):
     rclone authorize "drive" "SOME_LONG_ENCODED_TOKEN_STRING_WILL_APPEAR_HERE"

    Then paste the result Bellow:
    Result>
    ```
    * **On your local computer** (e.g., your laptop or desktop, which has a web browser and `rclone` installed):
        * If `rclone` isn't installed locally, download it from [rclone.org/downloads/](https://rclone.org/downloads/).
        * Open a terminal (Command Prompt, PowerShell, or Terminal) on your local computer.
        * Copy the entire `rclone authorize "drive" "LONG_TOKEN_STRING"` command displayed on your server's terminal and run it on your local machine's terminal.
        * This command will open a web browser on your local machine. Log in to the Google Account you wish to use for backups and grant `rclone` the requested permissions.
        * After successful authorization in the browser, go back to the terminal on your *local machine*. It will have printed a JSON string (starting with `{` and ending with `}`). This is your authorization token. Copy this entire JSON string.
    * **Back on your server's terminal**:
        * Paste the JSON token string (that you copied from your local machine's terminal) at the `Result>` prompt.
        * Press Enter.

4.  **Team Drive Configuration**:
    `Configure this as a team drive? (y/n)`: Type `n` and press Enter, unless you are specifically setting this up to use a Google Workspace Team Drive (Shared Drive).

5.  **Review and Confirm**:
    `rclone` will show you a summary of the remote configuration. If everything looks correct, type `y` and press Enter to save it.

6.  **Quit Configuration**:
    Type `q` and press Enter to exit the `rclone config` wizard.

You can test your new remote with `rclone lsd your_remote_name:` (e.g., `rclone lsd gdrive:`). *Note: Due to the `drive.file` scope, this command might show an empty list initially if rclone hasn't created any files or folders in your Drive yet with this specific remote configuration.*

### 2. Script Configuration (`.env` file)

This script uses a `.env` file to manage configuration variables, including database credentials, rclone settings, and scheduling parameters.

1.  **Create the `.env` file**:
    If you haven't already, copy the `.env.example` file (provided earlier or in your repository) to a new file named `.env` in the root directory of your project:
    ```bash
    cp .env.example .env
    ```

2.  **Edit the `.env` file** with your specific details. Below is a reminder of the variables:

    ```dotenv
    # MySQL Database Credentials
    DB_USER="your_mysql_user"
    DB_PASS="your_mysql_password"
    DB_NAME="your_application_database" # Leave empty for 'mysqldump --all-databases'

    # Rclone Configuration
    RCLONE_REMOTE="gdrive" # Must match the name from 'rclone config'
    GDRIVE_BACKUP_DIR="MySQL_Automated_Backups/MyServer"

    # Local Server Configuration
    LOCAL_BACKUP_DIR="/tmp/mysql_server_backups" # Ensure this directory exists and is writable

    # Backup Retention Policy
    KEEP_BACKUPS="8"

    # Cron Scheduling
    CRON_SCHEDULE="0 6 * * *" # Daily at 6:00 AM
    CRON_TIMEZONE="UTC" # e.g., "America/New_York", "Europe/London"
    ```
    * Replace placeholder values with your actual settings.
    * **`DB_USER`, `DB_PASS`**: Credentials for your MySQL server.
    * **`DB_NAME`**: Specify a database name, or leave empty to use `mysqldump --all-databases` (which includes system DBs like `mysql` but correctly handles `information_schema`, `performance_schema`).
    * **`RCLONE_REMOTE`**: The name you gave your rclone remote (e.g., `gdrive`).
    * **`GDRIVE_BACKUP_DIR`**: The path within your Google Drive where backups will be stored. Rclone will create this path if it doesn't exist.
    * **`LOCAL_BACKUP_DIR`**: A temporary local directory for storing `.sql.gz` files before upload.
    * **`KEEP_BACKUPS`**: How many old backup files to retain in Google Drive.
    * **`CRON_SCHEDULE`**: The schedule for `node-cron` to run the backup task.
    * **`CRON_TIMEZONE`**: Optional IANA timezone for the schedule.

## Usage

### Running Manually / Testing

The script includes a line to run the backup task once immediately upon starting, which is useful for testing:
```javascript
// At the end of app.js
console.log(`[${new Date().toISOString()}] Running an initial backup now...`);
backupAndUpload();
```
To run the script directly for a one-time test (and then start the scheduler):
```bash
node app.js
```
Monitor the console output for progress, logs, and any potential errors. This will help you verify that database dumping, compression, upload, and cleanup are working as expected.

### Running in Production (using PM2)

For running the script reliably in a production environment, it's highly recommended to use a process manager like `PM2`. PM2 will keep your script running in the background, restart it if it crashes, and help manage logs.

1.  **Install PM2 globally** (if you haven't already):
    ```bash
    sudo npm install pm2 -g
    ```

2.  **Start the backup script with PM2**:
    Navigate to your script's project directory in the terminal and run:
    ```bash
    pm2 start app.js --name mysql-gdrive-backup
    ```
    * `--name mysql-gdrive-backup` assigns a convenient name to your process.

3.  **Manage and Monitor with PM2**:
    * **List all running processes**: `pm2 list` or `pm2 status`
    * **View real-time logs**: `pm2 logs mysql-gdrive-backup` (Press `Ctrl+C` to exit logs)
    * **Stop a process**: `pm2 stop mysql-gdrive-backup`
    * **Restart a process**: `pm2 restart mysql-gdrive-backup`
    * **Delete a process from PM2's list**: `pm2 delete mysql-gdrive-backup`

4.  **Enable PM2 to Start on System Boot**:
    To ensure your backup script (and other PM2-managed processes) restart automatically after a server reboot:
    ```bash
    pm2 startup
    ```
    This command will output another command, which you'll likely need to run with `sudo` privileges. Copy and execute that displayed command.
    After setting up the startup script, save the current list of PM2 processes that you want to resurrect on boot:
    ```bash
    pm2 save
    ```

## Important Notes

### Google Drive Scope ('drive.file' - Scope 3)

As configured, this script uses Google Drive's `drive.file` scope for `rclone`. This has specific implications:
* `rclone` (and thus, this script) will **only be able to see, create, modify, and delete files and folders that it has created itself** using this specific OAuth token and remote configuration.
* It **will not** be able to access or see any other files or folders already existing in your Google Drive, even if they reside within the path specified by `GDRIVE_BACKUP_DIR` but were uploaded through other means (e.g., Google Drive web interface, a different rclone remote, or other apps).
* This behavior provides a more sandboxed and secure approach for the script's operations, making the `GDRIVE_BACKUP_DIR` effectively a private storage area for backups generated by this script.

### MySQL Credentials

* The script is set up to read `DB_USER` and `DB_PASS` from the `.env` file. Ensure this `.env` file is secured (e.g., correct file permissions) and **is listed in your `.gitignore` file** to prevent accidental commitment to version control.
* While using environment variables for credentials is common, for environments requiring stricter security postures, alternatives like MySQL's option files (e.g., `~/.my.cnf` on Linux for the user running the script) or dedicated secrets management tools could be considered. However, this script directly uses the `.env` variables as per its current design.

### `mysqldump --all-databases`

If the `DB_NAME` variable is left empty or commented out in your `.env` file, the script defaults to using the `mysqldump --all-databases` command. This command:
* Attempts to back up all databases present on the MySQL server.
* This includes system databases such as `mysql` (which stores user accounts, privileges, etc.).
* `mysqldump` correctly handles `information_schema`, `performance_schema`, and `sys` databases by typically excluding their data (as it's dynamic and runtime-specific) or only dumping their definitions.
* Be aware that backing up the `mysql` database includes sensitive information. Ensure that your backups (both local temporary files and those on Google Drive) are adequately secured.

## Troubleshooting

* **Check Console Logs**: The script outputs detailed logs to the console. If using PM2, access these via `pm2 logs mysql-gdrive-backup`. These logs are the first place to look for errors or unexpected behavior.
* **Permissions**:
    * The user running the Node.js script must have execute permissions for `mysqldump` and `rclone`.
    * The script needs write permissions to the `LOCAL_BACKUP_DIR` specified in `.env`.
    * The script needs read permissions for the `.env` file.
* **Rclone Independent Test**:
    Verify your `rclone` remote configuration separately if you suspect Google Drive connection issues:
    1.  List directories (may be empty with `drive.file` scope if nothing created yet):
        `rclone lsd YOUR_RCLONE_REMOTE:` (e.g., `rclone lsd gdrive:`)
    2.  Try creating a test file and uploading it to your backup directory:
        ```bash
        touch test_rclone_upload.txt
        rclone copy test_rclone_upload.txt YOUR_RCLONE_REMOTE:YOUR_GDRIVE_BACKUP_DIR/
        ```
    3.  List files in the backup directory (should now show `test_rclone_upload.txt`):
        ```bash
        rclone ls YOUR_RCLONE_REMOTE:YOUR_GDRIVE_BACKUP_DIR/
        ```
    4.  Clean up the test file:
        ```bash
        rclone delete YOUR_RCLONE_REMOTE:YOUR_GDRIVE_BACKUP_DIR/test_rclone_upload.txt
        ```
* **MySQL Connection**: Ensure the `DB_USER` and `DB_PASS` in `.env` are correct and that the user has the necessary privileges in MySQL to perform backups (typically `SELECT`, `LOCK TABLES`, `SHOW VIEW`, `TRIGGER`, `EVENT`, and `RELOAD` if dumping routines/events).

## License

This project is licensed under the MIT License.