// Script for drag-and-drop handling

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    const savedTheme = localStorage.getItem('theme');
    const setTheme = theme => {
        document.documentElement.setAttribute('data-theme', theme);
        themeToggle.setAttribute('aria-label', theme === 'dark'
            ? 'Переключить на светлую тему'
            : 'Переключить на тёмную тему');
    };

    if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
    } else {
        setTheme('light');
    }
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        themeToggle.style.transform = 'scale(0) rotate(180deg)';
        setTimeout(() => {
            setTheme(newTheme);
            localStorage.setItem('theme', newTheme);
            themeToggle.style.transform = 'scale(1) rotate(0deg)';
        }, 150);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    
    dropZone.addEventListener('click', function() {
        fileInput.click();
    });
    
    browseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFiles(this.files);
        }
    });
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropZone.classList.add('drag-over');
    }
    
    function unhighlight() {
        dropZone.classList.remove('drag-over');
    }
    
    dropZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleFiles(files);
        }
    }
    
    function handleFiles(files) {
        const processedFiles = Array.from(files).filter(file =>
            file.type.startsWith('image/') || 
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
        );
        
        if (processedFiles.length === 0) {
            alert('Select images or DOCX files');
            return;
        }
        
        console.log('Processing files:', processedFiles.length);
        processedFiles.forEach(processFile);
        dropZone.classList.remove('drag-over');
    }
    
    async function processFile(file) {
        if (file.type.startsWith('image/')) {
            await processImage(file);
        } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            await processDocx(file);
        } else {
            console.warn('File type ' + file.type + ' not supported');
        }
    }
    
    async function processDocx(file) {
        const fileName = file.name;
        const originalSize = file.size;
        
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="loading-spinner"></div><span>Compressing DOCX...</span>';
        loadingIndicator.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 1000;';
        document.body.appendChild(loadingIndicator);
        
        try {
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip not loaded');
            }
            
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            const newZip = new JSZip();
            
            const files = Object.keys(zip.files);
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
            
            for (const filePath of files) {
                const zipEntry = zip.files[filePath];
                if (zipEntry.dir) continue;
                
                if (filePath.includes('docProps/')) {
                    continue;
                }
                
                const extMatch = filePath.toLowerCase().match(/\.[^.]+$/);
                const isImage = extMatch && imageExtensions.includes(extMatch[0]);
                
                if (isImage) {
                    try {
                        loadingIndicator.querySelector('span').textContent = 'Compressing images...';
                        const imageData = await zipEntry.async('arraybuffer');
                        const ext = extMatch[0];
                        const optimized = await compressImageForDocx(imageData, ext);
                        newZip.file(filePath, optimized);
                    } catch(e) {
                        const data = await zipEntry.async('uint8array');
                        newZip.file(filePath, data);
                    }
                } else {
                    const data = await zipEntry.async('uint8array');
                    newZip.file(filePath, data);
                }
            }
            
            loadingIndicator.querySelector('span').textContent = 'Packing...';
            
            const compressedBlob = await newZip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 }
            });
            
            document.body.removeChild(loadingIndicator);
            
            const compressedSize = compressedBlob.size;
            
            if (compressedSize >= originalSize) {
                downloadFile(file, fileName);
                showCompressionResult(fileName, originalSize, originalSize, 0);
            } else {
                downloadFile(compressedBlob, fileName);
                const savingsPercent = Math.round((1 - compressedSize / originalSize) * 100);
                showCompressionResult(fileName, originalSize, compressedSize, savingsPercent);
            }
            
        } catch (error) {
            console.error('Error:', error);
            document.body.removeChild(loadingIndicator);
            alert('Error: ' + error.message);
        }
    }
    
    async function compressImageForDocx(arrayBuffer, ext) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([arrayBuffer]);
            const url = URL.createObjectURL(blob);
            const img = new Image();
            
            img.onload = async () => {
                URL.revokeObjectURL(url);
                
                const maxSize = 1200;
                let width = img.width;
                let height = img.height;
                
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const isPng = ext === '.png';
                const mimeType = isPng ? 'image/png' : 'image/jpeg';
                const quality = isPng ? undefined : 0.7;
                
                canvas.toBlob(async (outputBlob) => {
                    const result = await outputBlob.arrayBuffer();
                    resolve(result);
                }, mimeType, quality);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Error'));
            };
            
            img.src = url;
        });
    }
    
    async function processImage(file) {
        const fileName = file.name;
        const originalSize = file.size;
        
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="loading-spinner"></div><span>Compressing image...</span>';
        loadingIndicator.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 1000;';
        document.body.appendChild(loadingIndicator);
        
        try {
            const imageUrl = URL.createObjectURL(file);
            const img = new Image();
            img.src = imageUrl;
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            
            const maxDimension = 2000;
            let width = img.width;
            let height = img.height;
            
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            
            loadingIndicator.querySelector('span').textContent = 'Optimizing colors...';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = width;
            canvas.height = height;
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const imageData = ctx.getImageData(0, 0, width, height);
            const quantizedData = quantizeColors(imageData, 256);
            ctx.putImageData(quantizedData, 0, 0);
            
            loadingIndicator.querySelector('span').textContent = 'Saving...';
            
            const inputExt = getFileExtension(file.name).toLowerCase();
            let mimeType = 'image/png';
            
            if (inputExt !== 'png' && inputExt !== 'gif') {
                mimeType = 'image/webp';
            }
            
            let blob = await new Promise(resolve => {
                canvas.toBlob(resolve, mimeType, 0.8);
            });
            
            if (!blob || blob.size > originalSize * 0.9) {
                blob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/png', 1);
                });
            }
            
            document.body.removeChild(loadingIndicator);
            
            if (blob) {
                const compressedSize = blob.size;
                const savingsPercent = Math.round((1 - compressedSize / originalSize) * 100);
                
                URL.revokeObjectURL(imageUrl);
                downloadFile(blob, fileName);
                showCompressionResult(fileName, originalSize, compressedSize, savingsPercent);
            } else {
                console.error('Error creating compressed image');
                URL.revokeObjectURL(imageUrl);
                alert('Error compressing image');
            }
            
        } catch (error) {
            console.error('Error processing image:', error);
            document.body.removeChild(loadingIndicator);
            alert('Error processing image: ' + fileName);
        }
    }
    
    function quantizeColors(imageData, maxColors) {
        const data = imageData.data;
        const colorMap = new Map();
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            if (a < 10) continue;
            
            const key = Math.round(r/8)*8 + ',' + Math.round(g/8)*8 + ',' + Math.round(b/8)*8;
            
            if (colorMap.has(key)) {
                colorMap.set(key, colorMap.get(key) + 1);
            } else {
                colorMap.set(key, 1);
            }
        }
        
        if (colorMap.size <= maxColors) {
            return imageData;
        }
        
        const sortedColors = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);
        const topColors = new Set(sortedColors.slice(0, maxColors).map(entry => entry[0]));
        
        const colorPalette = [...topColors].map(key => {
            const [r, g, b] = key.split(',').map(Number);
            return {r, g, b};
        });
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            if (a < 10) continue;
            
            let closestColor = colorPalette[0];
            let minDistance = Infinity;
            
            for (const color of colorPalette) {
                const distance = Math.sqrt(
                    Math.pow(color.r - r, 2) +
                    Math.pow(color.g - g, 2) +
                    Math.pow(color.b - b, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestColor = color;
                }
            }
            
            data[i] = closestColor.r;
            data[i + 1] = closestColor.g;
            data[i + 2] = closestColor.b;
        }
        
        return imageData;
    }
    
    function getImageMimeType(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        
        switch (extension) {
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'webp':
                return 'image/webp';
            case 'avif':
                return 'image/avif';
            case 'gif':
                return 'image/gif';
            default:
                return 'image/jpeg';
        }
    }
    
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function showCompressionResult(filename, originalSize, compressedSize, savingsPercent) {
        addResultToUI(filename, originalSize, compressedSize, savingsPercent);
    }
    
    function addResultToUI(filename, originalSize, compressedSize, savingsPercent) {
        const resultsContainer = document.querySelector('.results-container');
        
        const resultCard = document.createElement('div');
        resultCard.className = 'result-card';
        
        resultCard.innerHTML = '<div class="result-header"><span class="filename">' + filename + '</span><div class="format-tags"><span class="format-tag">' + getFileExtension(filename) + '</span></div></div><div class="result-stats"><div class="stat-item"><label>Original size</label><span class="original-size">' + formatFileSize(originalSize) + '</span></div><div class="stat-item"><label>Compressed size</label><span class="new-size">' + formatFileSize(compressedSize) + '</span></div><div class="stat-item"><label>Savings</label><span class="savings ' + (savingsPercent < 0 ? 'negative' : '') + '">' + savingsPercent + '%</span></div></div><div class="progress-container"><div class="progress-bar"><div class="progress-fill" style="width: 0%;"></div></div></div>';
        
        resultsContainer.insertBefore(resultCard, resultsContainer.firstChild);
        
        setTimeout(() => {
            const progressBar = resultCard.querySelector('.progress-fill');
            progressBar.style.width = savingsPercent + '%';
        }, 100);
    }
    
    function downloadFile(blob, originalFilename) {
        const fileExtension = originalFilename.split('.').pop();
        const baseName = originalFilename.substring(0, originalFilename.lastIndexOf('.'));
        const downloadName = baseName + '_compressed.' + fileExtension;
        
        const downloadUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = downloadName;
        
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
        }, 100);
    }
    
    function getFileExtension(filename) {
        return filename.split('.').pop().toUpperCase();
    }
});
