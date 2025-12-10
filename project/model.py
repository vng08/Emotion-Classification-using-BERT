from transformers import AutoModelForSequenceClassification
from transformers import AutoTokenizer
import torch
import torch.nn.functional as F
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import os
import re
import numpy as np
from langdetect import detect
from deep_translator import GoogleTranslator

app = Flask(__name__, 
            static_folder='static',
            template_folder='templates')
CORS(app)

# Đường dẫn đến checkpoint
checkpoint_path = "distilbert-base-uncased-finetuned-emotion-2/checkpoint-1000"

# Load model và tokenizer từ checkpoint đã fine-tune
model = AutoModelForSequenceClassification.from_pretrained(checkpoint_path)
tokenizer = AutoTokenizer.from_pretrained(checkpoint_path)

# Đảm bảo model ở chế độ evaluation
model.eval()

# Map nhãn cảm xúc chi tiết
emotion_labels = {
    0: "sadness",
    1: "joy",
    2: "love",
    3: "anger",
    4: "fear",
    5: "surprise"
}

@app.route('/')
def home():
    return render_template('UI.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

def normalize_text(text):
    """
    Chuẩn hóa văn bản: chuyển thành chữ thường, chỉ giữ lại chữ cái và số.
    
    Args:
        text: Văn bản gốc
        
    Returns:
        Văn bản đã chuẩn hóa
    """
    # Chuyển thành chữ thường
    text = text.lower()
    
    # Chỉ giữ chữ cái và số (bỏ dấu câu, ký tự đặc biệt)
    text = re.sub(r'[^a-z0-9\s]', '', text)
    
    # Bỏ khoảng trắng thừa
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def split_text_into_chunks(text, max_tokens=450, overlap=50):
    """
    Chia văn bản thành các đoạn nhỏ hơn, cố gắng không cắt giữa câu.
    
    Args:
        text: Văn bản cần chia
        max_tokens: Số token tối đa cho mỗi đoạn
        overlap: Số token chồng lấp giữa các đoạn
        
    Returns:
        List các đoạn văn bản
    """
    # Tokenize toàn bộ văn bản
    tokens = tokenizer.encode(text)
    
    # Nếu văn bản ngắn hơn max_tokens, trả về nguyên văn bản
    if len(tokens) <= max_tokens:
        return [text]
    
    # Tìm các vị trí kết thúc câu và từ nối
    sentence_endings = []
    for i, token in enumerate(tokens):
        # Kiểm tra dấu câu
        if token in tokenizer.encode('.') or token in tokenizer.encode('?') or token in tokenizer.encode('!'):
            sentence_endings.append(i)
        # Kiểm tra từ nối
        elif i > 0 and i < len(tokens) - 1:
            # Kiểm tra các từ nối phổ biến
            for connector in ['and', 'but', 'or', 'because', 'although', 'however']:
                if tokenizer.decode([tokens[i-1], token, tokens[i+1]]).strip().lower() == connector:
                    sentence_endings.append(i)
                    break
    
    # Nếu không tìm thấy vị trí cắt phù hợp, chia đều theo max_tokens
    if not sentence_endings:
        chunks = []
        for i in range(0, len(tokens), max_tokens - overlap):
            chunk_tokens = tokens[i:i + max_tokens]
            chunk_text = tokenizer.decode(chunk_tokens)
            chunks.append(chunk_text)
        return chunks
    
    # Chia văn bản thành các đoạn tại các vị trí đã xác định
    chunks = []
    current_pos = 0
    
    while current_pos < len(tokens):
        # Tìm vị trí cắt phù hợp gần nhất trong phạm vi max_tokens
        end_pos = current_pos
        for pos in sentence_endings:
            if pos > current_pos and pos <= current_pos + max_tokens:
                end_pos = pos
            elif pos > current_pos + max_tokens:
                break
        
        # Nếu không tìm thấy vị trí cắt phù hợp trong phạm vi, lấy max_tokens
        if end_pos == current_pos:
            end_pos = min(current_pos + max_tokens, len(tokens))
        
        # Thêm đoạn văn bản vào danh sách
        chunk_tokens = tokens[current_pos:end_pos + 1]
        chunk_text = tokenizer.decode(chunk_tokens)
        chunks.append(chunk_text)
        
        # Cập nhật vị trí hiện tại, có chồng lấp
        current_pos = max(0, end_pos - overlap)
        
        # Nếu đã đến cuối văn bản, thoát vòng lặp
        if current_pos >= len(tokens) - 1:
            break
    
    return chunks

def translate_to_english(text):
    """
    Dịch văn bản từ tiếng Việt sang tiếng Anh nếu phát hiện là tiếng Việt.
    
    Args:
        text: Văn bản cần kiểm tra và dịch
        
    Returns:
        Văn bản tiếng Anh (nếu cần dịch) hoặc văn bản gốc (nếu đã là tiếng Anh)
    """
    try:
        detected_lang = detect(text)  # Dùng langdetect để phát hiện ngôn ngữ
        
        if detected_lang == 'vi':
            translator = GoogleTranslator(source='vi', target='en')
            translated = translator.translate(text)
            return translated
        else:
            return text
    except Exception as e:
        print(f"Translation error: {e}")
        return text
    

def predict_single_chunk(text):
    """
    Dự đoán cảm xúc cho một đoạn văn bản.
    
    Args:
        text: Đoạn văn bản cần phân tích
        
    Returns:
        Tuple (predicted_class, probabilities, token_count)
    """
    # Giới hạn số lượng token tối đa
    MAX_TOKENS = 512
    
    # Tokenize với giới hạn rõ ràng
    inputs = tokenizer(
        text, 
        return_tensors="pt", 
        truncation=True, 
        max_length=MAX_TOKENS,
        padding=True
    )
    
    token_count = len(inputs.input_ids[0])
    
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = F.softmax(logits, dim=-1)
        predicted_class = torch.argmax(probs, dim=-1).item()
    
    return predicted_class, probs[0].tolist(), token_count

def predict(text):
    """
    Dự đoán cảm xúc cho văn bản, xử lý văn bản dài bằng cách chia đoạn.
    
    Args:
        text: Văn bản cần phân tích
        
    Returns:
        Tuple (predicted_class, probabilities, token_count, chunk_results)
    """
    # Kiểm tra độ dài văn bản
    token_count = len(tokenizer.encode(text))
    
    # Nếu văn bản ngắn hơn 512 token, xử lý bình thường
    if token_count <= 512:
        predicted_class, probabilities, _ = predict_single_chunk(text)
        return predicted_class, probabilities, token_count, None
    
    # Chia văn bản thành các đoạn nhỏ
    chunks = split_text_into_chunks(text)
    print(f"Text split into {len(chunks)} chunks")
    
    # Dự đoán cho từng đoạn
    chunk_results = []
    all_probabilities = []
    
    for i, chunk in enumerate(chunks):
        chunk_token_count = len(tokenizer.encode(chunk))
        predicted_class, probabilities, _ = predict_single_chunk(chunk)
        
        chunk_results.append({
            'chunk_index': i,
            'token_count': chunk_token_count,
            'predicted_class': predicted_class,
            'probabilities': probabilities
        })
        
        all_probabilities.append(probabilities)
    
    # Tổng hợp kết quả từ các đoạn
    # Phương pháp 1: Lấy cảm xúc có xác suất trung bình cao nhất
    avg_probabilities = np.mean(all_probabilities, axis=0)
    predicted_class = np.argmax(avg_probabilities)
    
    return predicted_class, avg_probabilities.tolist(), token_count, chunk_results

def detect_emotions(text):
    """
    Phát hiện cảm xúc trong văn bản và trả về kết quả chi tiết.
    
    Args:
        text: Văn bản cần phân tích
        
    Returns:
        Dictionary chứa kết quả phân tích cảm xúc
    """
    # Tokenize văn bản
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True
    )
    
    # Dự đoán cảm xúc
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probabilities = F.softmax(logits, dim=-1)[0]
    
    # Lấy xác suất cho từng cảm xúc
    emotion_probs = probabilities.tolist()
    
    # Tạo kết quả chi tiết
    result = {
        "emotions": [],
        "dominant_emotion": None,
        "confidence": 0.0
    }
    
    # Thêm thông tin cho từng cảm xúc
    for emotion_id, emotion_name in emotion_labels.items():
        confidence = float(emotion_probs[emotion_id])
        result["emotions"].append({
            "emotion": emotion_name,
            "confidence": confidence
        })
    
    # Xác định cảm xúc chủ đạo
    dominant_idx = torch.argmax(probabilities).item()
    result["dominant_emotion"] = emotion_labels[dominant_idx]
    result["confidence"] = float(probabilities[dominant_idx])
    
    return result

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        text = data.get('text', '')
        options = data.get('options', {})
        
        # Áp dụng các options từ client
        if options.get('translate', False):
            text = translate_to_english(text)
            
        if options.get('normalize', False):
            text = normalize_text(text)
        
        # Kết quả từ phương pháp 1 (predict)
        if options.get('handleLongText', False):
            predicted_class, probabilities, token_count, chunk_results = predict(text)
        else:
            predicted_class, probabilities, token_count = predict_single_chunk(text)
            chunk_results = None
            
        result1 = {
            'emotion': emotion_labels[predicted_class],
            'confidence': round(probabilities[predicted_class] * 100, 2),
            'scores': {
                'sadness': round(probabilities[0] * 100, 2),
                'joy': round(probabilities[1] * 100, 2),
                'love': round(probabilities[2] * 100, 2),
                'anger': round(probabilities[3] * 100, 2),
                'fear': round(probabilities[4] * 100, 2),
                'surprise': round(probabilities[5] * 100, 2)
            },
            'token_count': token_count,
            'chunk_results': chunk_results
        }
        
        # Kết quả từ phương pháp 2 (detect_emotions)
        result2 = detect_emotions(text)
        
        # So sánh và chọn kết quả có độ tin cậy cao hơn
        final_result = result1
        if result2.get('confidence', 0) > result1['confidence']:
            final_result = {
                'emotion': result2['emotion'],
                'confidence': result2['confidence'],
                'scores': result2['scores'],
                'token_count': token_count,
                'chunk_results': chunk_results,
                'method': 'detect_emotions'
            }
        else:
            final_result['method'] = 'predict'
        
        return jsonify(final_result)
        
    except Exception as e:
        print(f"Error in analyze: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
    