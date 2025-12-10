document.addEventListener('DOMContentLoaded', function() {
    const textInput = document.getElementById('text-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultSection = document.getElementById('result-section');
    const resultInput = document.getElementById('result-input');
    const resultEmotion = document.getElementById('result-emotion');
    const resultConfidence = document.getElementById('result-confidence');
    const historyList = document.getElementById('history-list');
    const currentDate = document.getElementById('current-date');
    const statsChart = document.getElementById('stats-chart');

    // Khởi tạo biểu đồ
    const chart = echarts.init(statsChart);
    
    // Khởi tạo mảng lưu lịch sử phân tích
    let analysisHistory = JSON.parse(localStorage.getItem('analysisHistory') || '[]');
    const MAX_HISTORY_ITEMS = 10;

    // Khôi phục lịch sử từ localStorage
    function restoreHistory() {
        historyList.innerHTML = ''; // Xóa nội dung hiện tại
        
        // Giới hạn hiển thị 10 mục gần nhất
        const recentHistory = analysisHistory.slice(0, MAX_HISTORY_ITEMS);
        
        recentHistory.forEach(item => {
            const historyElement = document.createElement('div');
            historyElement.className = 'history-item py-3 cursor-pointer hover:bg-[#44475a] transition-colors duration-200';
            historyElement.innerHTML = `
                <div class="flex justify-between">
                    <span class="text-[#8be9fd]">[${item.timestamp}]</span>
                    <span class="text-2xl">${emojis[item.emotion]}</span>
                </div>
                <div class="text-sm text-[#f8f8f2] truncate">${item.text}</div>
            `;
            
            // Thêm sự kiện click để xem chi tiết
            historyElement.addEventListener('click', () => showHistoryDetail(item));
            
            historyList.appendChild(historyElement);
        });
        updateStats();
    }

    // Function to clear history
    function clearHistory() {
        analysisHistory = [];
        localStorage.setItem('analysisHistory', '[]');
        restoreHistory();
        updateStats();
    }

    // Cập nhật ngày hiện tại
    const now = new Date();
    currentDate.textContent = now.toLocaleDateString('vi-VN');

    // Emoji mapping
    const emojis = {
        sadness: '😢',
        joy: '😊',
        love: '😍',
        anger: '😡',
        fear: '😨',
        surprise: '😮',
        neutral: '😐'
    };

    // Khôi phục lịch sử khi trang được tải
    restoreHistory();

    // Xử lý sự kiện khi nhấn nút phân tích
    analyzeBtn.addEventListener('click', async function() {
        const text = textInput.value.trim();
        if (!text) return;

        // Hiển thị kết quả và thanh processing
        resultSection.classList.remove('hidden');
        resultInput.textContent = text;
        
        // Set progress bar to 100% and keep it there
        const progressBar = document.querySelector('.progress-bar-fill');
        progressBar.style.width = '100%';

        // Phân tích cảm xúc
        const result = await analyzeEmotion(text);
        
        // Hiển thị kết quả
        displayResult(result);
        
        // Thêm vào lịch sử và cập nhật thống kê
        addToHistory(text, result);
        
        // Reset input only
        textInput.value = '';
    });

    async function analyzeEmotion(text) {
        try {
            // Kiểm tra độ dài tối thiểu
            if (text.trim().length < 3) {
                return {
                    emotion: 'neutral',
                    confidence: 100,
                    scores: {
                        sadness: 0,
                        joy: 0,
                        love: 0,
                        anger: 0,
                        fear: 0,
                        surprise: 0,
                        neutral: 100
                    }
                };
            }

            // Kiểm tra xem có chỉ chứa số không
            if (/^\d+$/.test(text.trim())) {
                return {
                    emotion: 'neutral',
                    confidence: 100,
                    scores: {
                        sadness: 0,
                        joy: 0,
                        love: 0,
                        anger: 0,
                        fear: 0,
                        surprise: 0,
                        neutral: 100
                    }
                };
            }

            // Kiểm tra xem có ký tự lặp lại nhiều lần không
            const repeatedCharsPattern = /(.)\1{4,}/;
            if (repeatedCharsPattern.test(text)) {
                return {
                    emotion: 'neutral',
                    confidence: 100,
                    scores: {
                        sadness: 0,
                        joy: 0,
                        love: 0,
                        anger: 0,
                        fear: 0,
                        surprise: 0,
                        neutral: 100
                    }
                };
            }

            // Kiểm tra tỷ lệ ký tự đặc biệt
            const specialChars = text.replace(/[a-zA-Z0-9\s]/g, '').length;
            const totalChars = text.length;
            if (totalChars > 0 && (specialChars / totalChars) > 0.5) {
                return {
                    emotion: 'neutral',
                    confidence: 100,
                    scores: {
                        sadness: 0,
                        joy: 0,
                        love: 0,
                        anger: 0,
                        fear: 0,
                        surprise: 0,
                        neutral: 100
                    }
                };
            }

            const response = await fetch('http://localhost:5000/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    text,
                    options: {
                        translate: true,
                        normalize: true,
                        handleLongText: true
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const result = await response.json();
            console.log('API Response:', result);

            // Kiểm tra xem có emotion scores không
            if (!result.scores || Object.values(result.scores).every(score => score === 0)) {
                return {
                    emotion: 'neutral',
                    confidence: 100,
                    scores: {
                        sadness: 0,
                        joy: 0,
                        love: 0,
                        anger: 0,
                        fear: 0,
                        surprise: 0,
                        neutral: 100
                    }
                };
            }

            // Tìm cảm xúc có điểm cao nhất
            const maxScore = Math.max(...Object.values(result.scores));
            
            // Nếu không có cảm xúc nào vượt trội (điểm thấp), set là neutral
            if (maxScore < 30) {
                return {
                    emotion: 'neutral',
                    confidence: 100 - maxScore,
                    scores: {
                        ...result.scores,
                        neutral: 100 - maxScore
                    }
                };
            }

            return result;

        } catch (error) {
            console.error('Error:', error);
            return {
                emotion: 'neutral',
                confidence: 100,
                scores: {
                    sadness: 0,
                    joy: 0,
                    love: 0,
                    anger: 0,
                    fear: 0,
                    surprise: 0,
                    neutral: 100
                }
            };
        }
    }

    function displayResult(result) {
        console.log('Displaying result:', result); // Debug log
        
        // Hiển thị emoji
        resultEmotion.textContent = emojis[result.emotion];
        
        // Xử lý và hiển thị confidence
        let confidenceValue = result.confidence;
        if (result.emotion === 'neutral') {
            // Nếu là neutral, lấy điểm neutral từ scores
            confidenceValue = result.scores.neutral;
        }
        resultConfidence.textContent = `${Math.round(confidenceValue)}%`;
        
        // Update scores display for all emotions
        const emotionScores = document.querySelectorAll('.emotion-score');
        emotionScores.forEach(scoreElement => {
            const emotion = scoreElement.dataset.emotion;
            const score = result.scores[emotion] || 0;
            scoreElement.textContent = `${Math.round(score)}%`;
        });

        // Log debug information
        console.log('Emotion:', result.emotion);
        console.log('Confidence:', confidenceValue);
        console.log('Scores:', result.scores);
    }

    function addToHistory(text, result) {
        const now = new Date();
        const timestamp = now.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(',', '');

        // Thêm kết quả vào đầu mảng lịch sử
        const historyItem = {
            timestamp,
            text,
            emotion: result.emotion,
            scores: result.scores,
            confidence: result.confidence
        };
        
        analysisHistory.unshift(historyItem);
        
        // Giới hạn số lượng lịch sử lưu trữ
        if (analysisHistory.length > MAX_HISTORY_ITEMS) {
            analysisHistory = analysisHistory.slice(0, MAX_HISTORY_ITEMS);
        }
        
        // Lưu vào localStorage
        localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));

        // Cập nhật giao diện
        restoreHistory();
    }

    function showHistoryDetail(item) {
        console.log('History item:', item); // Debug log
        
        // Hiển thị kết quả trong phần result section
        resultSection.classList.remove('hidden');
        resultInput.textContent = item.text;
        resultEmotion.textContent = emojis[item.emotion];
        
        // Xử lý và hiển thị confidence
        let confidenceValue;
        if (item.emotion === 'neutral') {
            confidenceValue = item.scores.neutral;
        } else {
            confidenceValue = item.confidence || Math.max(...Object.values(item.scores));
        }
        console.log('Confidence value:', confidenceValue); // Debug log
        console.log('Scores:', item.scores); // Debug log
        
        resultConfidence.textContent = `${Math.round(confidenceValue)}%`;
        
        // Hiển thị điểm số cho tất cả các cảm xúc
        const emotionScores = document.querySelectorAll('.emotion-score');
        emotionScores.forEach(scoreElement => {
            const emotion = scoreElement.dataset.emotion;
            const score = item.scores[emotion] || 0;
            scoreElement.textContent = `${Math.round(score)}%`;
        });

        // Tạo biểu đồ chi tiết cho item này
        const detailChart = echarts.init(document.getElementById('stats-chart'));
        const option = {
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c}%'
            },
            color: ['#50fa7b', '#8be9fd', '#ff5555', '#ff79c6', '#bd93f9', '#ffb86c', '#f8f8f2'],
            series: [{
                type: 'pie',
                radius: '70%',
                data: [
                    { 
                        value: Math.round(item.scores.sadness), 
                        name: 'Sadness',
                        itemStyle: { color: '#8be9fd' }
                    },
                    { 
                        value: Math.round(item.scores.joy), 
                        name: 'Joy',
                        itemStyle: { color: '#50fa7b' }
                    },
                    { 
                        value: Math.round(item.scores.love), 
                        name: 'Love',
                        itemStyle: { color: '#ff79c6' }
                    },
                    { 
                        value: Math.round(item.scores.anger), 
                        name: 'Anger',
                        itemStyle: { color: '#ff5555' }
                    },
                    { 
                        value: Math.round(item.scores.fear), 
                        name: 'Fear',
                        itemStyle: { color: '#bd93f9' }
                    },
                    { 
                        value: Math.round(item.scores.surprise), 
                        name: 'Surprise',
                        itemStyle: { color: '#ffb86c' }
                    },
                    { 
                        value: Math.round(item.scores.neutral), 
                        name: 'Neutral',
                        itemStyle: { color: '#f8f8f2' }
                    }
                ],
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                },
                label: {
                    color: '#f8f8f2',
                    formatter: '{b}\n{c}%'
                }
            }]
        };
        detailChart.setOption(option);

        // Scroll đến phần kết quả
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    function updateStats() {
        // Tính tổng điểm cho mỗi loại cảm xúc từ tất cả các phân tích
        const totalScores = {
            sadness: 0,
            joy: 0,
            love: 0,
            anger: 0,
            fear: 0,
            surprise: 0,
            neutral: 0
        };

        // Đếm số lượng mỗi loại cảm xúc
        const emotionCounts = {
            sadness: 0,
            joy: 0,
            love: 0,
            anger: 0,
            fear: 0,
            surprise: 0,
            neutral: 0
        };

        analysisHistory.forEach(item => {
            // Cộng dồn điểm số cho từng cảm xúc
            Object.keys(totalScores).forEach(emotion => {
                totalScores[emotion] += item.scores[emotion] || 0;
            });

            // Đếm số lần xuất hiện của mỗi cảm xúc
            emotionCounts[item.emotion]++;
        });

        // Tính điểm trung bình
        const totalAnalyses = analysisHistory.length || 1;
        const avgScores = {};
        Object.keys(totalScores).forEach(emotion => {
            avgScores[emotion] = Math.round(totalScores[emotion] / totalAnalyses);
        });

        // Cập nhật biểu đồ với điểm trung bình
        const option = {
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c}%'
            },
            color: ['#8be9fd', '#50fa7b', '#ff79c6', '#ff5555', '#bd93f9', '#ffb86c', '#f8f8f2'],
            series: [{
                type: 'pie',
                radius: '70%',
                data: [
                    { 
                        value: avgScores.sadness, 
                        name: 'Sadness',
                        itemStyle: { color: '#8be9fd' }
                    },
                    { 
                        value: avgScores.joy, 
                        name: 'Joy',
                        itemStyle: { color: '#50fa7b' }
                    },
                    { 
                        value: avgScores.love, 
                        name: 'Love',
                        itemStyle: { color: '#ff79c6' }
                    },
                    { 
                        value: avgScores.anger, 
                        name: 'Anger',
                        itemStyle: { color: '#ff5555' }
                    },
                    { 
                        value: avgScores.fear, 
                        name: 'Fear',
                        itemStyle: { color: '#bd93f9' }
                    },
                    { 
                        value: avgScores.surprise, 
                        name: 'Surprise',
                        itemStyle: { color: '#ffb86c' }
                    },
                    { 
                        value: avgScores.neutral, 
                        name: 'Neutral',
                        itemStyle: { color: '#f8f8f2' }
                    }
                ],
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                },
                label: {
                    color: '#f8f8f2',
                    formatter: '{b}\n{c}%'
                }
            }]
        };

        chart.setOption(option);
    }

    // Add event listeners for command buttons
    document.querySelectorAll('.command').forEach(button => {
        button.addEventListener('click', function() {
            const command = this.textContent.trim();
            switch(command) {
                case '/analyze':
                    textInput.focus();
                    break;
                case '/history':
                    historyList.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '/stats':
                    statsChart.scrollIntoView({ behavior: 'smooth' });
                    break;
                case '/help':
                    alert('Available commands:\n/analyze - Focus text input\n/history - View analysis history\n/stats - View emotion statistics\n/clear - Clear text input and hide result');
                    break;
                case '/clear':
                    textInput.value = '';
                    resultSection.classList.add('hidden');
                    break;
                
            }
        });
    });

    // Add event listener for clear history button
    document.getElementById('clear-history').addEventListener('click', function() {
        if (confirm('Are you sure you want to delete all history?')) {
            clearHistory();
        }
    });
}); 