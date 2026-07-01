var UPLOAD_FOLDER_ID = "1QmqpXvg-Se1vWTUewcskEV3fku_j9PQZ";
var ALLOWED_IMAGE_MIME_TYPES = {
  "image/jpeg": true,
  "image/png": true,
  "image/gif": true,
  "image/webp": true
};
var CHECK_FILE_PREFIX = "gas-permission-check";
var DRIVE_CRUD_SECRET_PROPERTY = "DRIVE_CRUD_SECRET";
var DEFAULT_LIST_LIMIT = 50;
var MAX_LIST_LIMIT = 200;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No upload payload received.");
    }

    var data = JSON.parse(e.postData.contents);
    var action = String(data.action || "upload").toLowerCase();

    if (action === "request_otp" || action === "requestotp") {
      return createJsonResponse({
        success: true,
        otp: requestEmailOtp(data.recipientEmail, data.userName, data.purpose)
      });
    }

    if (action === "verify_otp" || action === "verifyotp") {
      return createJsonResponse({
        success: true,
        otp: verifyEmailOtp(data.otpToken, data.otpCode, data.recipientEmail, data.purpose)
      });
    }

    if (action === "otp" || action === "sendotp" || action === "send_otp") {
      return createJsonResponse({
        success: true,
        email: sendOtpEmail(data.recipientEmail, data.userName, data.otpCode)
      });
    }

    if (action === "confirmation" || action === "confirmemail" || action === "confirm_email") {
      return createJsonResponse({
        success: true,
        email: sendConfirmationEmail(data.recipientEmail, data.userName, data.confirmationLink)
      });
    }

    if (action === "store_created" || action === "storecreated") {
      requireCrudSecret(data.secret);
      return createJsonResponse({
        success: true,
        email: sendStoreCreatedEmail(
          data.recipientEmail,
          data.userName,
          data.store,
          data.loginLink,
          data.requirePasswordChange
        )
      });
    }

    if (action === "staff_created" || action === "staffcreated") {
      requireCrudSecret(data.secret);
      return createJsonResponse({
        success: true,
        email: sendStaffCreatedEmail(
          data.recipientEmail,
          data.userName,
          data.storeName,
          data.loginLink,
          data.requirePasswordChange
        )
      });
    }

    if (action === "upload") {
      return createJsonResponse(uploadImage(data));
    }

    requireCrudSecret(data.secret);

    if (action === "delete") return createJsonResponse(deleteImage(data));
    if (action === "permanent_delete" || action === "erase") return createJsonResponse(permanentlyDeleteImage(data));
    if (action === "restore") return createJsonResponse(restoreImage(data));
    if (action === "rename" || action === "update") return createJsonResponse(updateImageMetadata(data));
    if (action === "replace") return createJsonResponse(replaceImage(data));
    if (action === "get" || action === "read") return createJsonResponse(getImageMetadata(data));
    if (action === "list") return createJsonResponse(listImages(data));

    return createJsonResponse({
      success: false,
      error: "Unsupported action: " + action
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

function doGet(e) {
  var action = e && e.parameter ? String(e.parameter.action || "") : "";
  if (action === "check" || action === "diagnostics") {
    return createJsonResponse(checkConfiguration({
      writeTest: e && e.parameter && String(e.parameter.write || "") === "1"
    }));
  }

  try {
    if (action === "get" || action === "read") {
      requireCrudSecret(e && e.parameter ? e.parameter.secret : "");
      return createJsonResponse(getImageMetadata(e.parameter));
    }

    if (action === "list") {
      requireCrudSecret(e && e.parameter ? e.parameter.secret : "");
      return createJsonResponse(listImages(e.parameter));
    }
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }

  return createJsonResponse({
    success: true,
    message: "Web App is running correctly.",
    diagnosticsUrl: "?action=check",
    writeDiagnosticsUrl: "?action=check&write=1"
  });
}

function setupPermissions() {
  return checkConfiguration({ writeTest: true });
}

function uploadImage(data) {
  var base64Data = String(data.base64 || "").replace(/^data:[^,]+,/, "");
  var fileName = sanitizeFileName(data.fileName || "uploaded-image");
  var mimeType = String(data.mimeType || "").toLowerCase();

  if (!base64Data) throw new Error("Missing image data.");
  if (!ALLOWED_IMAGE_MIME_TYPES[mimeType]) throw new Error("Unsupported image type: " + mimeType);

  var decodedData = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decodedData, mimeType, fileName);
  var folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  var file = folder.createFile(blob);
  var sharingWarning = makeFilePublic(file);

  return createImageResponse(file, {
    sharingWarning: sharingWarning
  });
}

function deleteImage(data) {
  var file = getManagedImageFile(data.fileId);
  file.setTrashed(true);
  return {
    success: true,
    action: "delete",
    fileId: file.getId(),
    trashed: file.isTrashed()
  };
}

function permanentlyDeleteImage(data) {
  var fileId = String(data.fileId || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) throw new Error("Invalid or missing fileId.");

  try {
    getManagedImageFile(fileId);
  } catch (lookupError) {
    if (/not found|does not exist|No item with the given ID/i.test(String(lookupError))) {
      return {
        success: true,
        action: "permanent_delete",
        fileId: fileId,
        permanentlyDeleted: true,
        alreadyDeleted: true
      };
    }
    throw lookupError;
  }

  var response = UrlFetchApp.fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId),
    {
      method: "delete",
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken()
      },
      muteHttpExceptions: true
    }
  );
  var status = response.getResponseCode();

  if (status !== 204) {
    throw new Error("Google Drive permanent deletion failed (HTTP " + status + "): " + response.getContentText());
  }

  return {
    success: true,
    action: "permanent_delete",
    fileId: fileId,
    permanentlyDeleted: true
  };
}

function restoreImage(data) {
  var file = getManagedImageFile(data.fileId);
  file.setTrashed(false);
  return {
    success: true,
    action: "restore",
    file: fileToJson(file)
  };
}

function updateImageMetadata(data) {
  var file = getManagedImageFile(data.fileId);

  if (data.fileName) file.setName(sanitizeFileName(data.fileName));
  if (typeof data.description !== "undefined") file.setDescription(String(data.description || "").slice(0, 500));

  var sharingWarning = "";
  if (data.makePublic === true || String(data.makePublic || "").toLowerCase() === "true") {
    sharingWarning = makeFilePublic(file);
  }

  return createImageResponse(file, {
    action: "update",
    sharingWarning: sharingWarning
  });
}

function replaceImage(data) {
  var oldFile = getManagedImageFile(data.fileId);
  var newImage = uploadImage(data);

  try {
    oldFile.setTrashed(true);
    newImage.replacedFileId = oldFile.getId();
    newImage.replacedFileTrashed = true;
  } catch (error) {
    newImage.replacedFileId = oldFile.getId();
    newImage.replacedFileTrashed = false;
    newImage.warning = "New image uploaded, but old image could not be trashed: " + error.toString();
  }

  newImage.action = "replace";
  return newImage;
}

function getImageMetadata(data) {
  var file = getManagedImageFile(data.fileId);
  return {
    success: true,
    action: "get",
    file: fileToJson(file)
  };
}

function listImages(data) {
  var folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  var files = folder.getFiles();
  var limit = Math.min(Math.max(Number(data.limit || DEFAULT_LIST_LIMIT), 1), MAX_LIST_LIMIT);
  var includeTrashed = data.includeTrashed === true || String(data.includeTrashed || "").toLowerCase() === "true";
  var items = [];

  while (files.hasNext() && items.length < limit) {
    var file = files.next();
    if (!includeTrashed && file.isTrashed()) continue;
    if (!ALLOWED_IMAGE_MIME_TYPES[String(file.getMimeType() || "").toLowerCase()]) continue;
    items.push(fileToJson(file));
  }

  return {
    success: true,
    action: "list",
    count: items.length,
    limit: limit,
    items: items
  };
}

function sanitizeFileName(fileName) {
  return String(fileName)
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "uploaded-image";
}

function createJsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireCrudSecret(providedSecret) {
  var expectedSecret = PropertiesService.getScriptProperties().getProperty(DRIVE_CRUD_SECRET_PROPERTY);

  if (!expectedSecret) {
    throw new Error("Drive CRUD actions are disabled. Set Script Property " + DRIVE_CRUD_SECRET_PROPERTY + " before using this action.");
  }

  if (!providedSecret || String(providedSecret) !== expectedSecret) {
    throw new Error("Unauthorized Drive CRUD action.");
  }
}

function getManagedImageFile(fileId) {
  fileId = String(fileId || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) throw new Error("Invalid or missing fileId.");

  var file = DriveApp.getFileById(fileId);
  var mimeType = String(file.getMimeType() || "").toLowerCase();

  if (!ALLOWED_IMAGE_MIME_TYPES[mimeType]) throw new Error("File is not an allowed image type: " + mimeType);
  if (!isFileInUploadFolder(file)) throw new Error("File is not in the configured upload folder.");

  return file;
}

function isFileInUploadFolder(file) {
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === UPLOAD_FOLDER_ID) return true;
  }
  return false;
}

function makeFilePublic(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "";
  } catch (sharingError) {
    return sharingError.toString();
  }
}

function createImageResponse(file, extras) {
  var response = fileToJson(file);
  response.success = true;

  extras = extras || {};
  Object.keys(extras).forEach(function(key) {
    response[key] = extras[key];
  });

  return response;
}

function fileToJson(file) {
  var fileId = file.getId();
  return {
    fileId: fileId,
    name: file.getName(),
    mimeType: file.getMimeType(),
    size: file.getSize(),
    description: file.getDescription(),
    dateCreated: file.getDateCreated().toISOString(),
    lastUpdated: file.getLastUpdated().toISOString(),
    trashed: file.isTrashed(),
    url: "https://lh3.googleusercontent.com/d/" + fileId + "=w4000",
    webViewLink: "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing"
  };
}

function checkConfiguration(options) {
  options = options || {};

  var summary = {
    success: false,
    checkedAt: new Date().toISOString(),
    folderId: UPLOAD_FOLDER_ID,
    executeAs: "USER_DEPLOYING",
    access: "ANYONE_ANONYMOUS",
    checks: {
      driveAppAccessible: false,
      folderReadable: false,
      folderWritable: false,
      publicSharingAllowed: false,
      crudSecretConfigured: false,
      cleanupSucceeded: null
    },
    details: {
      effectiveUserEmail: "",
      activeUserEmail: "",
      folderName: "",
      testFileId: ""
    },
    warnings: [],
    errors: [],
    nextSteps: []
  };

  try {
    summary.details.effectiveUserEmail = Session.getEffectiveUser().getEmail();
  } catch (error) {
    summary.warnings.push("Could not read effective user email: " + error.toString());
  }

  try {
    summary.details.activeUserEmail = Session.getActiveUser().getEmail();
  } catch (error) {
    summary.warnings.push("Could not read active user email: " + error.toString());
  }

  try {
    DriveApp.getRootFolder();
    summary.checks.driveAppAccessible = true;
  } catch (error) {
    summary.errors.push("DriveApp is not accessible: " + error.toString());
  }

  try {
    summary.checks.crudSecretConfigured = Boolean(PropertiesService.getScriptProperties().getProperty(DRIVE_CRUD_SECRET_PROPERTY));
  } catch (error) {
    summary.warnings.push("Could not read Script Properties: " + error.toString());
  }

  var folder = null;
  try {
    folder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
    summary.details.folderName = folder.getName();
    summary.checks.folderReadable = true;
  } catch (error) {
    summary.errors.push("Upload folder is not readable: " + error.toString());
  }

  if (folder && options.writeTest) {
    var testFile = null;
    try {
      var testName = CHECK_FILE_PREFIX + "-" + Utilities.formatDate(new Date(), "Asia/Manila", "yyyy-MM-dd_HH-mm-ss") + ".txt";
      var testBlob = Utilities.newBlob("permission check", "text/plain", testName);
      testFile = folder.createFile(testBlob);
      summary.details.testFileId = testFile.getId();
      summary.checks.folderWritable = true;
    } catch (error) {
      summary.errors.push("Upload folder is not writable: " + error.toString());
    }

    if (testFile) {
      try {
        testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        summary.checks.publicSharingAllowed = true;
      } catch (error) {
        summary.warnings.push("Public link sharing is blocked or not allowed: " + error.toString());
      }

      try {
        testFile.setTrashed(true);
        summary.checks.cleanupSucceeded = true;
      } catch (error) {
        summary.checks.cleanupSucceeded = false;
        summary.warnings.push("Could not trash the test file. Delete it manually if needed: " + summary.details.testFileId);
      }
    }
  } else if (folder) {
    summary.nextSteps.push("Open this web app with ?action=check&write=1, or run setupPermissions(), to test file creation and public sharing.");
  }

  if (!summary.checks.driveAppAccessible) summary.nextSteps.push("Add the Drive OAuth scope in appsscript.json and reauthorize the deployment.");
  if (!summary.checks.folderReadable) summary.nextSteps.push("Verify UPLOAD_FOLDER_ID and make sure the deploying account can access the folder.");
  if (options.writeTest && !summary.checks.folderWritable) summary.nextSteps.push("Make sure the deploying account has Editor access to the upload folder.");
  if (options.writeTest && summary.checks.folderWritable && !summary.checks.publicSharingAllowed) {
    summary.nextSteps.push("The upload can work, but public image display may fail until folder/file link sharing is allowed by Drive or Workspace policy.");
  }
  if (!summary.checks.crudSecretConfigured) summary.nextSteps.push("Set Script Property " + DRIVE_CRUD_SECRET_PROPERTY + " to enable protected list/read/update/delete image actions.");

  summary.success =
    summary.checks.driveAppAccessible &&
    summary.checks.folderReadable &&
    (!options.writeTest || summary.checks.folderWritable);

  if (summary.success && options.writeTest && summary.checks.publicSharingAllowed) {
    summary.nextSteps.push("Everything required for upload and public image display is configured.");
  } else if (summary.success && !options.writeTest) {
    summary.nextSteps.push("Basic Drive access is configured. Run the write diagnostics to confirm upload and sharing.");
  }

  return summary;
}
