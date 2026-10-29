import sys,json
from pathlib import Path
import pandas as pd
import joblib
ROOT=Path(__file__).resolve().parent
MODEL=ROOT/'artifacts'/'yield_model.joblib'
DATA=ROOT/'data'/'processed_apy.csv'
def main():
 d=json.loads(sys.stdin.readline()); history=pd.read_csv(DATA); history=history.dropna(subset=['Crop','Season']); pairs=sorted(set((str(c),str(s)) for c,s in zip(history.Crop,history.Season)))
 if d.get('action')=='status':return {'ready':MODEL.is_file(),'pairs':[{'crop':c,'season':s} for c,s in pairs]}
 if d.get('action')!='predict':return {'error':'Unknown action'}
 crop,season=d['crop'],d['season']
 if (crop,season) not in pairs:return {'error':'Crop-season combination not in training data'}
 year=int(d['year']); prev=float(d['previousYield']); area=float(d['areaHectares'])
 if not (2025<=year<=2030 and 0<prev<=1e6 and 0<area<=1e5):return {'error':'Invalid inputs'}
 model=joblib.load(MODEL) # Load only locally trained/trusted artifact; never accept uploaded model files.
 X=pd.DataFrame([{'Crop':crop,'Season':season,'Year':year,'PreviousYield':prev}]); y=float(model.predict(X)[0]);
 if not (0<y<1e7):return {'error':'Model returned an invalid estimate'}
 return {'predictedYieldKgHa':round(y,2),'estimatedProductionQuintals':round(y*area/100,2),'areaHectares':area,'previousYieldKgHa':prev,'notice':'Experimental All-India baseline trained on limited historical years; not a validated district/farm forecast. Future-year extrapolation is especially uncertain.'}
if __name__=='__main__':
 try:print(json.dumps(main()))
 except Exception as e:print(json.dumps({'error':'Inference unavailable: '+str(e)[:180]}))
