import torch
import torch.nn as nn

class ECGClassifier(nn.Module):
    def __init__(self, num_classes=5):
        super().__init__()
        
        # 1D CNN Feature Extractor
        # Input shape: [batch_size, 1, 5000]
        self.conv1 = nn.Conv1d(1, 32, kernel_size=15, stride=2, padding=7)
        self.bn1 = nn.BatchNorm1d(32)
        self.relu = nn.ReLU()
        self.pool1 = nn.MaxPool1d(2) # Downsample to 1250
        
        self.conv2 = nn.Conv1d(32, 64, kernel_size=11, stride=2, padding=5)
        self.bn2 = nn.BatchNorm1d(64)
        self.pool2 = nn.MaxPool1d(2) # Downsample to 312
        
        self.conv3 = nn.Conv1d(64, 128, kernel_size=7, stride=1, padding=3)
        self.bn3 = nn.BatchNorm1d(128)
        self.pool3 = nn.MaxPool1d(2) # Downsample to 156
        
        self.conv4 = nn.Conv1d(128, 256, kernel_size=5, stride=1, padding=2)
        self.bn4 = nn.BatchNorm1d(256)
        self.pool4 = nn.MaxPool1d(2) # Downsample to 78
        
        # Bidirectional LSTM Layer
        # Input shape to LSTM: [batch_size, seq_len=78, features=256]
        self.lstm = nn.LSTM(
            input_size=256, 
            hidden_size=128, 
            num_layers=2, 
            batch_first=True, 
            bidirectional=True, 
            dropout=0.2
        )
        
        # Classifier Head (pooling outputs from BiLSTM: hidden_size * 2 = 256)
        # We concatenate Global Max Pooling and Global Average Pooling over time (256 * 2 = 512)
        self.fc1 = nn.Linear(256 * 2, 64)
        self.fc2 = nn.Linear(64, num_classes)
        self.dropout = nn.Dropout(0.3)
        
    def forward(self, x):
        # Convolutional layers
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.pool1(x)
        
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.pool2(x)
        
        x = self.relu(self.bn3(self.conv3(x)))
        x = self.pool3(x)
        
        x = self.relu(self.bn4(self.conv4(x)))
        x = self.pool4(x)
        
        # Prepare for LSTM (transpose channels and time)
        # Output shape: [batch, features=256, seq_len=78] -> [batch, seq_len=78, features=256]
        x = x.transpose(1, 2)
        
        # LSTM forward pass
        # lstm_out shape: [batch_size, seq_len=78, hidden_size * 2 = 256]
        lstm_out, _ = self.lstm(x)
        
        # Global average and max pooling over the time dimension (dim=1)
        avg_pool = torch.mean(lstm_out, dim=1)
        max_pool, _ = torch.max(lstm_out, dim=1)
        
        # Concatenate poolings
        out = torch.cat((avg_pool, max_pool), dim=1) # Shape: [batch_size, 512]
        
        # Dense classification layers
        out = self.relu(self.fc1(out))
        out = self.dropout(out)
        out = self.fc2(out)
        
        return out
