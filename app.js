require('dotenv').config();

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const util = require('util');
const cron = require('node-cron');

const execPromise = util.promisify(exec);

const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const dbName = process.env.DB_NAME; // If is undefined/null, let's do --all-databases
const rcloneRemote = process.env.RCLONE_REMOTE;
const gdriveBackupDir = process.env.GDRIVE_BACKUP_DIR;
const localBackupDir = process.env.LOCAL_BACKUP_DIR;
const keepBackups = parseInt(process.env.KEEP_BACKUPS || '8', 10);
const cronSchedule = process.env.CRON_SCHEDULE || '0 6 * * *'; // Default 6 AM
const cronTimezone = process.env.CRON_TIMEZONE;

if (!rcloneRemote || !gdriveBackupDir || !localBackupDir) {
    console.error('Error: Missing vars (RCLONE_REMOTE, GDRIVE_BACKUP_DIR, LOCAL_BACKUP_DIR). Check your .env file.');
    process.exit(1); 
}

async function runCommand(command) {
    console.log(`[${new Date().toISOString()}] Running: ${command}`);
    try {

        const { stdout, stderr } = await execPromise(command);
        if (stderr) {
            console.warn(`[${new Date().toISOString()}] Stderr: ${stderr.trim()}`);
        }
        if (stdout) {
             console.log(`[${new Date().toISOString()}] Stdout: ${stdout.trim()}`);
        }
        return { stdout, stderr, success: true };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error running command: ${command}`);
        console.error(`[${new Date().toISOString()}] Output code: ${error.code}`);
        console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
        console.error(`[${new Date().toISOString()}] Stderr: ${error.stderr?.trim()}`);
        console.error(`[${new Date().toISOString()}] Stdout: ${error.stdout?.trim()}`);
        return { stdout: error.stdout, stderr: error.stderr, success: false };
    }
}

async function backupAndUpload() {
    const startTime = Date.now();
    console.log(`\n[${new Date().toISOString()}] === Starting Backup Task ===`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbIdentifier = dbName || 'all-databases';
    const backupFilename = `backup_${dbIdentifier}_${timestamp}.sql.gz`;
    const localBackupPath = path.join(localBackupDir, backupFilename);
    const rcloneDestPath = `${rcloneRemote}:${gdriveBackupDir}/`; // Trailing slash

    try {
        // 1. Set local dir
        await fs.mkdir(localBackupDir, { recursive: true });
        console.log(`[${new Date().toISOString()}] local dir setted: ${localBackupDir}`);

        // 2. mysqldump Command
        let mysqldumpCmd = 'mysqldump';
        if (dbUser) {
            mysqldumpCmd += ` --user="${dbUser}"`;
        }
       
        if (dbPass) { mysqldumpCmd += ` --password="${dbPass}"`; } 

        if (dbName) {
            mysqldumpCmd += ` "${dbName}"`;
        } else {
            mysqldumpCmd += ' --all-databases';
        }
        // Add recommend options
        mysqldumpCmd += ' --single-transaction --quick --lock-tables=false'; // For InnoDB

        // Combine mysqldump and gzip using pipe
        const fullDumpCmd = `${mysqldumpCmd} | gzip > "${localBackupPath}"`;
        let result = await runCommand(fullDumpCmd);
        if (!result.success) throw new Error('Failed mysqldump/gzip');
        console.log(`[${new Date().toISOString()}] Backup created and compressed: ${localBackupPath}`);

        // 3. Upload to Google Drive
        // Use --progress if you want to see progress in logs (may be verbose)
        const uploadCommand = `rclone copy "${localBackupPath}" "${rcloneDestPath}" --progress`;
        result = await runCommand(uploadCommand);
        // Checking whether rclone copy actually succeeded can be more complex (check stderr?)
        // For now, we rely on exit code 0.
        if (!result.success) throw new Error('rclone copy failure');
        console.log(`[${new Date().toISOString()}] Backup uploaded to Google Drive.`);

        // 4. Clean up old backups on Google Drive
        console.log(`[${new Date().toISOString()}] Cleaning up old backups (maintaining ${keepBackups})...`);
        const listCommand = `rclone lsf "${rcloneDestPath}" --files-only --order-by modtime,ascending`;
        result = await runCommand(listCommand);
        if (!result.success) throw new Error('rclone lsf failed to list');

        const allFiles = result.stdout.split('\n').filter(Boolean); // Array of file names
        const filesToDelete = allFiles.slice(0, Math.max(0, allFiles.length - keepBackups));

        if (filesToDelete.length > 0) {
            console.log(`[${new Date().toISOString()}] They will be eliminated ${filesToDelete.length} old backups.`);
            for (const fileToDelete of filesToDelete) {
                // Make sure you don't delete unexpected files
                if (!fileToDelete.startsWith('backup_')) {
                    console.warn(`[${new Date().toISOString()}] Skipping deletion of suspicious file: ${fileToDelete}`);
                    continue;
                }
                const deleteCommand = `rclone delete "${rcloneDestPath}${fileToDelete}"`;
                // Run delete but don't stop everything if one fails
                await runCommand(deleteCommand);
            }
            console.log(`[${new Date().toISOString()}] Google Drive cleanup complete.`);
        } else {
            console.log(`[${new Date().toISOString()}] There are no old backups to delete.`);
        }

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ### BACKUP TASK ERROR ###`);
        console.error(`[${new Date().toISOString()}] ${error.message}`);
    } finally {
        // 5. Always clean local backup
        try {
            console.log(`[${new Date().toISOString()}] Cleaning local file: ${localBackupPath}`);
            await fs.unlink(localBackupPath);
            console.log(`[${new Date().toISOString()}] Local file deleted.`);
        } catch (unlinkError) {
            // If the file does not exist (because mysqldump failed), it is not a critical error
            if (unlinkError.code !== 'ENOENT') {
                console.error(`[${new Date().toISOString()}] Error deleting local file: ${unlinkError.message}`);
            } else {
                 console.log(`[${new Date().toISOString()}] Local file not found to delete (possibly already deleted or never created).`);
            }
        }
        const endTime = Date.now();
        console.log(`[${new Date().toISOString()}] === Backup Task Completed (Duration: ${((endTime - startTime)/1000).toFixed(2)}s) ===\n`);
    }
}

// --- Scheduling with Node-Cron ---
console.log(`[${new Date().toISOString()}] Backup script started.`);
console.log(`[${new Date().toISOString()}] Scheduling tasks with schedule: '${cronSchedule}' ${cronTimezone ? 'in time zone ' + cronTimezone : ''}`);

const cronOptions = {};
if (cronTimezone) {
    cronOptions.timezone = cronTimezone;
}

if (!cron.validate(cronSchedule)) {
    console.error(`[${new Date().toISOString()}] ERROR: The format of the CRON_SCHEDULE ('${cronSchedule}') is not valid.`);
    process.exit(1);
}

// Schedule the task
cron.schedule(cronSchedule, () => {
    console.log(`[${new Date().toISOString()}] *** Triggering scheduled backup task... ***`);
    backupAndUpload();
}, cronOptions);

// Message to know that the scheduler is active
console.log(`[${new Date().toISOString()}] El planificador de tareas está activo. Esperando la próxima ejecución programada.`);

// Ejecutar una vez al inicio para pruebas
console.log(`[${new Date().toISOString()}] Running an initial backup now...`);
backupAndUpload();