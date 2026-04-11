import { google } from "googleapis";
import { Readable } from "stream";

// ─── Credentials ─────────────────────────────────────────────────

function buildCredentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Drive OAuth is not configured. " +
        "Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN in .env"
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ─── Folders ──────────────────────────────────────────────────────

async function getOrCreateFolder(auth: any, name: string, parentId?: string): Promise<string> {
  const drive = google.drive({ version: "v3", auth });
  const parentQuery = parentId ? ` and '${parentId}' in parents` : " and 'root' in parents";
  // Escape single quotes in name
  const safeName = name.replace(/'/g, "\\'");
  const query = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false${parentQuery}`;

  const res = await drive.files.list({
    q: query,
    spaces: "drive",
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const fileMetadata: Record<string, unknown> = {
    name: name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata as { name: string; mimeType: string; parents?: string[] },
    fields: "id",
    supportsAllDrives: true,
  });

  // Automatically make new structured folders accessible (anyone reader)
  await drive.permissions.create({
    fileId: folder.data.id!,
    requestBody: { type: "anyone", role: "reader" },
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

export async function ensureDrivePath(pathSegments: string[]): Promise<string> {
  const auth = buildCredentials();
  let currentParentId: string | undefined = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  for (const segment of pathSegments) {
    currentParentId = await getOrCreateFolder(auth, segment, currentParentId);
  }

  return currentParentId!;
}

// ─── Upload ──────────────────────────────────────────────────────

/**
 * Upload a file buffer to Google Drive and return the public webViewLink.
 * Port of services/google_drive.py::upload_bytes_to_google_drive
 */
export async function uploadBytesToGoogleDrive(params: {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string | null;
  folderId: string | null;
  prefix: string;
  exactName?: boolean;
}): Promise<string> {
  const { fileBuffer, originalName, mimeType, folderId, prefix, exactName } = params;

  const auth = buildCredentials();
  const drive = google.drive({ version: "v3", auth });

  const safeName = originalName.split("/").pop() || "document";
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const fileName = exactName ? safeName : `${prefix}-${timestamp}-${safeName}`;

  const fileMetadata: Record<string, unknown> = { name: fileName };
  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  const media = {
    mimeType: mimeType || "application/octet-stream",
    body: Readable.from(fileBuffer),
  };

  try {
    const created = await drive.files.create({
      requestBody: fileMetadata as { name: string; parents?: string[] },
      media,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });

    const fileId = created.data.id!;

    // Make publicly accessible
    await drive.permissions.create({
      fileId,
      requestBody: { type: "anyone", role: "reader" },
      supportsAllDrives: true,
    });

    // Re-fetch to ensure we have the webViewLink
    const refreshed = await drive.files.get({
      fileId,
      fields: "webViewLink",
      supportsAllDrives: true,
    });

    return refreshed.data.webViewLink || created.data.webViewLink || "";
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("invalid_grant")) {
      throw new Error(
        "Google Drive OAuth refresh token expired. Run the setup script to re-authenticate."
      );
    }
    if (msg.includes("notFound") || msg.includes("File not found")) {
      throw new Error(
        "Google Drive folder not found or not accessible"
      );
    }
    if (msg.includes("insufficientFilePermissions")) {
      throw new Error(
        "Google Drive permission denied for the configured folder"
      );
    }

    throw new Error(`Google Drive API error: ${msg}`);
  }
}
