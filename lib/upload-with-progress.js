// Uploads a form and reports progress: onProgress(0.42) means 42% of the file has been sent.
// fetch() can't tell you how much of an UPLOAD is done, but the older XMLHttpRequest can.
// Resolves with { ok, data } like a fetch() + response.json() would.
export function uploadWithProgress(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const ok = request.status >= 200 && request.status < 300;
      resolve({ ok, data: request.response || { error: "Upload failed" } });
    };
    request.onerror = () => reject(new Error("Could not reach the server"));
    request.send(form);
  });
}
