"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Upload, LogOut, Sparkles } from "lucide-react";
import { usePrivy, useWallets, useAuthDetails } from '@/lib/auth';
import { ethers } from 'ethers';
import { ImageGrid } from './ImageGrid';
import {
  initCamera,
  uploadImage,
  compressImage,
  loadExistingPhotos,
  handleSmileBack,
  deletePhoto,
  saveWinningPhoto,
  ImageItem,
} from '../utils/camera';
import GoFundSmiles from './GoFundSmiles';
import { NOUNS_SVG } from '../constants/nouns';

const CONTRACT_ADDRESS = "0xf5526Ff322FBE97c31160A94A380093151Aa442F";
const CONTRACT_ABI = [
  "function analyzeSmile(string memory photoUrl) external payable",
  "function getOracleFee() external view returns (uint256)",
  "event SmileAnalysisReceived(bytes32 indexed requestId, string photoUrl, uint8 smileScore)"
];

const BASE_CHAIN_ID = 8453;
const BASE_CONFIG = {
  chainId: BASE_CHAIN_ID,
  name: 'Base',
  network: 'base',
  rpcUrls: {
    default: 'https://mainnet.base.org',
    public: 'https://mainnet.base.org',
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://basescan.org' },
  },
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
};

interface ImageState {
  url: string;
  timestamp: string;
  isLoading: boolean;
  smileCount: number;
  smileScore: number | undefined;
  hasWon: boolean | undefined;
  isNounish: boolean;
  userId?: string;
}

const App = () => {
  const { login, authenticated, user, logout, isSimulated } = usePrivy();
  const { wallets } = useWallets();
  const { setUsdcBalance } = useAuthDetails();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [images, setImages] = useState<ImageState[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | React.ReactNode>('');
  const [processedImages] = useState(new Set<string>());
  const [nounsFilterEnabled, setNounsFilterEnabled] = useState(false);

  useEffect(() => {
    const savedValue = localStorage.getItem('nounsFilterEnabled') === 'true';
    setNounsFilterEnabled(savedValue);
  }, []);

  useEffect(() => {
    loadExistingPhotos().then((photos) => {
      setImages(
        photos.map((p) => ({
          url: p.url,
          timestamp: p.timestamp,
          isLoading: false,
          smileCount: p.smileCount,
          smileScore: p.smileScore,
          hasWon: p.hasWon,
          isNounish: p.isNounish,
          userId: p.userId,
        }))
      );
    });

    initCamera(videoRef).then((active) => {
      setCameraAvailable(active);
    });

    const initContract = async () => {
      if (!authenticated || wallets.length === 0 || isSimulated) return;

      try {
        const wallet = wallets[0];
        const provider = await wallet.getEthersProvider();
        if (!provider) return;

        const network = await provider.getNetwork().catch(() => null);
        if (network && network.chainId !== BASE_CHAIN_ID) {
          try {
            await wallet.switchChain(BASE_CHAIN_ID);
          } catch (switchError: any) {
            console.warn('Network switch skipped:', switchError);
          }
        }

        const signer = provider.getSigner();
        const smilePleaseContract = new ethers.Contract(
          CONTRACT_ADDRESS,
          CONTRACT_ABI,
          signer
        );

        try {
          await smilePleaseContract.getOracleFee();
          setContract(smilePleaseContract);

          smilePleaseContract.on(
            "SmileAnalysisReceived",
            async (requestId: string, photoUrl: string, smileScore: number) => {
              if (processedImages.has(photoUrl)) return;
              processedImages.add(photoUrl);

              const hasWon = smileScore > 3;
              if (hasWon) {
                await saveWinningPhoto({
                  userId: user?.id || 'anon',
                  imageUrl: photoUrl,
                  smileScore,
                  isNounish: nounsFilterEnabled,
                });
                setUsdcBalance((prev) => +(prev + 0.001).toFixed(3));
              }

              handleAnalysisResult(photoUrl, smileScore, hasWon);
            }
          );
        } catch (contractErr) {
          console.warn('Live contract not reachable on this network, using simulated oracle:', contractErr);
        }
      } catch (error) {
        console.warn('Contract initialization error:', error);
      }
    };

    initContract();

    return () => {
      if (contract) {
        contract.removeAllListeners("SmileAnalysisReceived");
      }
    };
  }, [authenticated, wallets, isSimulated]);

  useEffect(() => {
    if (nounsFilterEnabled && videoRef.current) {
      const video = videoRef.current;
      const overlay = document.createElement('div');
      overlay.id = 'nouns-overlay';
      overlay.innerHTML = NOUNS_SVG;
      overlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10;
        width: 75%;
        height: 75%;
      `;

      const svg = overlay.querySelector('svg');
      if (svg) {
        svg.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80%;
          height: auto;
        `;
      }

      video.parentElement?.appendChild(overlay);

      return () => {
        document.getElementById('nouns-overlay')?.remove();
      };
    }
  }, [nounsFilterEnabled]);

  const handleAnalysisResult = (photoUrl: string, smileScore: number, hasWon: boolean) => {
    setImages((prev) =>
      prev.map((img) => {
        if (img.url === photoUrl) {
          return {
            ...img,
            isLoading: false,
            smileScore,
            hasWon,
            isNounish: nounsFilterEnabled,
          };
        }
        return img;
      })
    );

    if (hasWon) {
      setUploadStatus(`🎉 Amazing smile! Score: ${smileScore}/5 - You won 0.001 USDC 🎊`);
    } else {
      let message;
      switch (smileScore) {
        case 1:
          message = `Come on, show us your teeth! Smile score: ${smileScore}/5`;
          break;
        case 2:
          message = `Almost there! Give us a bigger smile! Score: ${smileScore}/5`;
          break;
        case 3:
          message = `So close! Just smile a bit more genuinely! Score: ${smileScore}/5`;
          break;
        default:
          message = `Try again with a bigger smile! Score: ${smileScore}/5`;
      }
      setUploadStatus(message);
      setTimeout(() => {
        setImages((prev) => prev.filter((img) => img.url !== photoUrl));
      }, 3500);
    }

    setTimeout(() => {
      setUploadStatus('');
      setLoading(false);
    }, 3500);
  };

  const processCapturedBlob = async (blob: Blob) => {
    setLoading(true);
    setUploadStatus('Processing image...');
    try {
      const compressedBlob = await compressImage(blob);
      setUploadStatus('Uploading smile...');
      const uploadResult = await uploadImage(compressedBlob, user?.id || 'anon', nounsFilterEnabled);

      const newImage: ImageState = {
        url: uploadResult.url,
        timestamp: new Date().toISOString(),
        isLoading: true,
        smileCount: 0,
        smileScore: undefined,
        hasWon: false,
        isNounish: nounsFilterEnabled,
        userId: user?.id,
      };
      setImages((prev) => [newImage, ...prev]);

      // If connected to live on-chain contract, trigger on-chain transaction
      if (contract && !isSimulated) {
        try {
          const oracleFee = await contract.getOracleFee();
          const tx = await contract.analyzeSmile(uploadResult.url, {
            value: oracleFee,
            gasLimit: 500000,
          });
          setUploadStatus('Your smile is being submitted on-chain... 😊');
          await tx.wait(1);
          setUploadStatus('On-chain AI Oracle analysis in progress... 🤖');
          return;
        } catch (onChainErr) {
          console.warn('On-chain tx failed, falling back to simulated oracle:', onChainErr);
        }
      }

      // Simulated / Local AI Oracle Flow
      setUploadStatus('Submitting smile to Base Oracle... ⚡');
      await new Promise((r) => setTimeout(r, 1000));
      setUploadStatus('AI Oracle evaluating smile authenticity... 🤖');

      const res = await fetch('/api/analyze-smile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: uploadResult.url }),
      });
      const data = await res.json();
      const smileScore = data.smileScore || 5;
      const hasWon = smileScore > 3;

      if (hasWon) {
        await saveWinningPhoto({
          userId: user?.id || 'anon',
          imageUrl: uploadResult.url,
          smileScore,
          isNounish: nounsFilterEnabled,
        });
        setUsdcBalance((prev) => +(prev + 0.001).toFixed(3));
      }

      handleAnalysisResult(uploadResult.url, smileScore, hasWon);
    } catch (error: any) {
      console.error('Error processing photo:', error);
      setUploadStatus(error?.message || 'Failed to process photo');
      setTimeout(() => {
        setUploadStatus('');
        setLoading(false);
      }, 3000);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setLoading(true);
    setUploadStatus('Capturing smile...');
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 360;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
          'image/jpeg',
          0.85
        );
      });

      await processCapturedBlob(blob);
    } catch (err: any) {
      console.error('Capture error:', err);
      setUploadStatus('Error capturing photo');
      setTimeout(() => setLoading(false), 2000);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processCapturedBlob(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSmileBackLocal = async (imageUrl: string) => {
    try {
      const newCount = await handleSmileBack(imageUrl);
      setImages((prev) =>
        prev.map((img) =>
          img.url === imageUrl ? { ...img, smileCount: newCount } : img
        )
      );
    } catch (error) {
      console.error('Error handling smile back:', error);
    }
  };

  const handleDeleteLocal = async (imageUrl: string, userId: string) => {
    try {
      await deletePhoto(imageUrl, userId);
      setImages((prev) => prev.filter((img) => img.url !== imageUrl));
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  };

  const toggleNounsFilter = () => {
    const newValue = !nounsFilterEnabled;
    setNounsFilterEnabled(newValue);
    localStorage.setItem('nounsFilterEnabled', String(newValue));
  };

  const shimmerStyle = `
    relative
    overflow-hidden
    before:absolute
    before:inset-0
    before:-translate-x-full
    before:animate-[shimmer_2s_infinite]
    before:bg-gradient-to-r
    before:from-transparent
    before:via-white/60
    before:to-transparent
  `;

  return (
    <div className="bg-[#FFFDF0] min-h-screen pb-16">
      <div className="container mx-auto px-4 py-8 max-w-[1200px]">
        {/* Hero Card */}
        <div className="bg-[#FFE5E5] border-[3px] border-black rounded-xl p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-10 max-w-2xl mx-auto transition-transform hover:-translate-y-1">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="bg-[#FFD700] border-2 border-black font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider">
              Base Network
            </span>
            <span className="bg-[#90EE90] border-2 border-black font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> AI Oracle
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-center mb-4 tracking-tight">
            Hi, I'm Mr. Based Smiles 😁
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold text-center mb-5 flex items-center justify-center flex-wrap gap-1">
            Smile and I will reward you 0.001
            <img 
              src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" 
              alt="USDC" 
              className="inline h-6 w-6 border-2 border-black rounded-full" 
            />
            USDC on
            <img 
              src="https://avatars.githubusercontent.com/u/108554348?v=4" 
              alt="Base" 
              className="inline h-6 w-6 border-2 border-black rounded-full" 
            />
            Base!
          </h2>
          <p className="text-base sm:text-lg font-bold text-center bg-[#90EE90] border-[3px] border-black rounded-lg p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            Immutable AI Oracle agent living on Base, scoring genuine happiness!
          </p>
        </div>

        {/* Camera Feed / Photo Uploader */}
        <div className="relative mb-6 max-w-[480px] mx-auto">
          {cameraAvailable ? (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-[360px] object-cover border-[3px] border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-black"
              />
              <Button
                onClick={toggleNounsFilter}
                className={`absolute top-4 right-4 text-black font-black px-3 py-2 border-[2px] border-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs sm:text-sm ${
                  nounsFilterEnabled ? 'bg-[#90EE90]' : 'bg-white hover:bg-gray-100'
                }`}
              >
                {nounsFilterEnabled ? 'Feeling Nounish 🤓' : 'Feel Nounish? 👓'}
              </Button>
            </div>
          ) : (
            <div className="w-full h-[320px] flex flex-col items-center justify-center border-[3px] border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-[#FFF0F5] p-6 text-center">
              <Camera className="w-16 h-16 text-gray-500 mb-3" />
              <h4 className="text-xl font-black mb-2">Webcam Not Active</h4>
              <p className="text-sm text-gray-700 mb-4 font-medium">
                No camera detected or permission denied. You can still test smile analysis by uploading a photo!
              </p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#90EE90] hover:bg-[#7CDF7C] text-black font-black px-4 py-2 border-[2px] border-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              >
                <Upload className="w-4 h-4 mr-2" /> Select Smiling Photo
              </Button>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Action Controls */}
        <div className="text-center mb-8 flex justify-center items-center flex-wrap gap-4">
          {authenticated ? (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {cameraAvailable && (
                <Button
                  onClick={capturePhoto}
                  disabled={loading}
                  className="bg-[#90EE90] hover:bg-[#7CDF7C] text-black font-black px-6 py-4 text-lg border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] transition-all"
                >
                  <Camera className="mr-2 h-5 w-5" />
                  Capture Smile!
                </Button>
              )}
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-[#FFD700] hover:bg-[#EEC200] text-black font-bold px-4 py-4 text-sm border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <Upload className="mr-1 h-4 w-4" />
                Upload Photo
              </Button>

              <Button
                onClick={logout}
                title="Disconnect Wallet"
                className="bg-[#FFB6C1] hover:bg-[#FF9CAE] text-black font-bold p-4 border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <Button
                onClick={login}
                className="bg-[#90EE90] hover:bg-[#7CDF7C] text-black font-black text-lg px-8 py-4 border-[3px] border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 active:translate-x-[2px] active:translate-y-[2px] transition-all"
              >
                Connect Wallet to Smile 😊
              </Button>
            </div>
          )}
        </div>

        {/* GoFundSmiles Donation Component */}
        {authenticated && <GoFundSmiles wallet={wallets[0]} />}

        {/* Gallery Heading */}
        <div className="text-center my-8">
          <h3 className="text-3xl font-black inline-block bg-[#FFE5E5] px-6 py-2 border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            Winning Smiles Gallery 🌟
          </h3>
        </div>

        {/* Smile Cards Grid */}
        <ImageGrid 
          images={images}
          authenticated={authenticated}
          userId={user?.id}
          onSmileBack={handleSmileBackLocal}
          onDelete={handleDeleteLocal}
          shimmerStyle={shimmerStyle}
        />
      </div>

      {/* Loading & Feedback Modal */}
      {loading && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <Card className="p-8 bg-white border-[3px] border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-sm w-full text-center animate-in zoom-in-95 duration-150">
            <div className="text-5xl mb-4 animate-bounce">😁</div>
            <p className="font-black text-lg text-gray-900">{uploadStatus}</p>
          </Card>
        </div>
      )}
    </div>
  );
};

export default App;
