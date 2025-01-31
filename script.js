// Importar FFmpeg corretamente
const { FFmpeg } = window;
let videoFile = null;
let isFFmpegReady = false;
let projectTimeline = [];
let undoStack = [];
let redoStack = [];
let currentTime = 0;
let isPlaying = false;
let selectedClip = null;

// Criar instância do FFmpeg com configuração atualizada
const ffmpeg = new FFmpeg();

// Configurar FFmpeg
ffmpeg.on('log', ({ message }) => {
    console.log(message);
});

ffmpeg.on('progress', ({ progress, time }) => {
    console.log(`Progresso: ${Math.round(progress * 100)}%`);
});

// Elementos do DOM
const elements = {
    videoInput: document.getElementById('videoInput'),
    uploadBtn: document.getElementById('addMediaBtn'),
    videoPreview: document.getElementById('videoPreview'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    timelineSlider: document.getElementById('timelineSlider'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    filterSelect: document.getElementById('filterSelect'),
    brightnessControl: document.getElementById('brightnessControl'),
    contrastControl: document.getElementById('contrastControl'),
    saturationControl: document.getElementById('saturationControl'),
    exportBtn: document.getElementById('exportBtn'),
    exportFormat: document.getElementById('exportFormat'),
    exportQuality: document.getElementById('exportQuality'),
    mediaList: document.getElementById('mediaList')
};

// Desabilitar botões até o FFmpeg estar pronto
elements.exportBtn.disabled = true;

// Inicializar FFmpeg
(async () => {
    try {
        console.log('Carregando FFmpeg...');
        await ffmpeg.load({
            coreURL: await toBlobURL('/node_modules/@ffmpeg/core/dist/ffmpeg-core.js', 'text/javascript'),
            wasmURL: await toBlobURL('/node_modules/@ffmpeg/core/dist/ffmpeg-core.wasm', 'application/wasm')
        });
        
        isFFmpegReady = true;
        console.log('FFmpeg está pronto!');
        enableControls();
    } catch (error) {
        console.error('Erro ao carregar FFmpeg:', error);
        alert('Erro ao carregar FFmpeg. Por favor, verifique o console para mais detalhes.');
    }
})();

// Função para formatar tempo em MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Eventos de mídia
elements.uploadBtn.addEventListener('click', () => {
    elements.videoInput.click();
});

elements.videoInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            videoFile = file;
            const videoUrl = URL.createObjectURL(file);
            elements.videoPreview.src = videoUrl;
            
            // Adicionar à lista de mídia
            const mediaItem = document.createElement('div');
            mediaItem.className = 'media-item';
            mediaItem.innerHTML = `
                <span>${file.name}</span>
                <video src="${videoUrl}" style="width: 100px; height: 60px;"></video>
            `;
            elements.mediaList.appendChild(mediaItem);

            // Configurar preview
            elements.videoPreview.onloadedmetadata = () => {
                elements.totalTime.textContent = formatTime(elements.videoPreview.duration);
                elements.timelineSlider.max = Math.floor(elements.videoPreview.duration);
            };
        }
    });
});

// Controles de reprodução
elements.playPauseBtn.addEventListener('click', () => {
    if (elements.videoPreview.paused) {
        elements.videoPreview.play();
        elements.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        elements.videoPreview.pause();
        elements.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
});

// Atualizar timeline
elements.videoPreview.addEventListener('timeupdate', () => {
    const currentTime = elements.videoPreview.currentTime;
    elements.timelineSlider.value = currentTime;
    elements.currentTime.textContent = formatTime(currentTime);
});

elements.timelineSlider.addEventListener('input', (e) => {
    const time = parseFloat(e.target.value);
    elements.videoPreview.currentTime = time;
    elements.currentTime.textContent = formatTime(time);
});

// Aplicar filtros em tempo real
elements.filterSelect.addEventListener('change', applyVideoFilters);
elements.brightnessControl.addEventListener('input', applyVideoFilters);
elements.contrastControl.addEventListener('input', applyVideoFilters);
elements.saturationControl.addEventListener('input', applyVideoFilters);

function applyVideoFilters() {
    const brightness = 1 + (elements.brightnessControl.value / 100);
    const contrast = 1 + (elements.contrastControl.value / 100);
    const saturation = 1 + (elements.saturationControl.value / 100);
    
    let filter = '';
    
    // Aplicar filtro selecionado
    switch (elements.filterSelect.value) {
        case 'grayscale':
            filter += 'grayscale(1) ';
            break;
        case 'sepia':
            filter += 'sepia(1) ';
            break;
        case 'vintage':
            filter += 'sepia(0.5) contrast(1.2) ';
            break;
        case 'cinema':
            filter += 'contrast(1.1) saturate(1.2) ';
            break;
        case 'dramatic':
            filter += 'contrast(1.3) brightness(0.9) ';
            break;
    }
    
    // Aplicar ajustes
    filter += `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
    elements.videoPreview.style.filter = filter;
}

// Exportação
elements.exportBtn.addEventListener('click', async () => {
    if (!videoFile || !isFFmpegReady) {
        alert('Por favor, selecione um vídeo primeiro.');
        return;
    }

    try {
        const format = elements.exportFormat.value;
        const quality = elements.exportQuality.value;

        // Mostrar progresso
        elements.exportBtn.disabled = true;
        elements.exportBtn.textContent = 'Exportando...';

        // Configurações de qualidade
        const qualitySettings = {
            high: { crf: 18, bitrate: '8M' },
            medium: { crf: 23, bitrate: '4M' },
            low: { crf: 28, bitrate: '2M' }
        }[quality];

        // Processar vídeo
        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
        
        await ffmpeg.run(
            '-i', 'input.mp4',
            '-c:v', 'libx264',
            '-crf', qualitySettings.crf.toString(),
            '-preset', 'medium',
            '-c:a', 'aac',
            'output.' + format
        );

        const data = ffmpeg.FS('readFile', 'output.' + format);
        const blob = new Blob([data.buffer], { type: 'video/' + format });
        const url = URL.createObjectURL(blob);

        // Download
        const a = document.createElement('a');
        a.href = url;
        a.download = `video_editado.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Erro na exportação:', error);
        alert('Erro ao exportar o vídeo. Verifique o console para mais detalhes.');
    } finally {
        elements.exportBtn.disabled = false;
        elements.exportBtn.textContent = 'Exportar Projeto';
    }
});

// Estilização da lista de mídia
const style = document.createElement('style');
style.textContent = `
    .media-item {
        padding: 10px;
        margin: 5px 0;
        background: var(--background-dark);
        border-radius: 4px;
        cursor: pointer;
    }
    .media-item:hover {
        background: var(--primary-color);
    }
    .media-item span {
        display: block;
        margin-bottom: 5px;
        font-size: 0.9em;
    }
`;
document.head.appendChild(style);

// Função para habilitar controles
function enableControls() {
    elements.exportBtn.disabled = false;
    elements.filterSelect.disabled = false;
    elements.brightnessControl.disabled = false;
    elements.contrastControl.disabled = false;
    elements.saturationControl.disabled = false;
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Configurar canvas de overlay
    const ctx = elements.overlayCanvas.getContext('2d');
    
    // Atualizar dimensões do canvas
    function updateCanvasSize() {
        elements.overlayCanvas.width = elements.videoPreview.clientWidth;
        elements.overlayCanvas.height = elements.videoPreview.clientHeight;
    }
    
    window.addEventListener('resize', updateCanvasSize);
    updateCanvasSize();
}); 