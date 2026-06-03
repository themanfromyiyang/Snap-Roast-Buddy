const storageKey = "snap-roast-poster-images";
const frames = [...document.querySelectorAll(".upload-frame[data-slot]")];
const savedImages = loadSavedImages();

for (const frame of frames) {
  const slot = frame.dataset.slot;
  const input = frame.querySelector("input");

  if (slot && savedImages[slot]) {
    setFrameImage(frame, savedImages[slot]);
  }

  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file || !slot) return;

    const dataUrl = await readImageFile(file);
    savedImages[slot] = dataUrl;
    localStorage.setItem(storageKey, JSON.stringify(savedImages));
    setFrameImage(frame, dataUrl);
  });
}

document.getElementById("clearPosterImages")?.addEventListener("click", () => {
  localStorage.removeItem(storageKey);
  for (const frame of frames) {
    const image = frame.querySelector("img");
    frame.classList.remove("has-image");
    if (image) {
      image.hidden = true;
      image.removeAttribute("src");
    }
  }
});

document.getElementById("printPoster")?.addEventListener("click", () => {
  window.print();
});

function setFrameImage(frame, src) {
  const image = frame.querySelector("img");
  if (!image) return;
  image.src = src;
  image.hidden = false;
  frame.classList.add("has-image");
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function loadSavedImages() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
