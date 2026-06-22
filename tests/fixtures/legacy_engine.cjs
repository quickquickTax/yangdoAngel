/* ── capital_gains_tax_engine.js ─────────────────────────────────────────
   양도소득세 계산 순수 로직 모듈
   - 브라우저: window.CGT 로 노출
   - Node.js: module.exports 로 노출
────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CGT = api;
  }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function calcHoldingYears(acquisitionDate, transferDate) {
    var acq = new Date(acquisitionDate);
    var trf = new Date(transferDate);
    if (isNaN(acq) || isNaN(trf)) throw new Error('날짜 형식 오류');
    if (trf <= acq) throw new Error('양도일은 취득일 이후여야 합니다');
    var years  = trf.getFullYear() - acq.getFullYear();
    var months = trf.getMonth()    - acq.getMonth();
    var days   = trf.getDate()     - acq.getDate();
    if (days < 0)   months -= 1;
    if (months < 0) years  -= 1;
    return Math.max(0, years);
  }

  function calcLtcDeduction(holdingYears, residenceYears, assetType) {
    assetType      = assetType      || 'general';
    residenceYears = residenceYears || 0;
    if (holdingYears < 3) return { rate:0, holdingRate:0, residenceRate:0, applicable:false };
    var holdingRate = 0, residenceRate = 0;
    if (assetType === 'housing_1h1h') {
      holdingRate   = Math.min(40, 12 + (Math.max(holdingYears, 3)   - 3) * 4);
      residenceRate = residenceYears >= 2
                    ? Math.min(40, 8  + (Math.max(residenceYears, 2) - 2) * 4) : 0;
    } else {
      holdingRate = Math.min(30, 6 + (Math.max(holdingYears, 3) - 3) * 2);
    }
    return { applicable:true, holdingRate:holdingRate, residenceRate:residenceRate,
             rate: holdingRate + residenceRate };
  }

  var BRACKETS = [
    [   14000000, 0.06,        0],
    [   50000000, 0.15,  1260000],
    [   88000000, 0.24,  5760000],
    [  150000000, 0.35, 15440000],
    [  300000000, 0.38, 19940000],
    [  500000000, 0.40, 25940000],
    [ 1000000000, 0.42, 35940000],
    [Infinity,    0.45, 65940000]
  ];

  function calcBasicTax(taxBase) {
    if (taxBase <= 0) return 0;
    for (var i = 0; i < BRACKETS.length; i++) {
      if (taxBase <= BRACKETS[i][0])
        return Math.floor(taxBase * BRACKETS[i][1] - BRACKETS[i][2]);
    }
    return 0;
  }

  function calcTax(opts) {
    var taxBase = opts.taxBase || 0, holdingYears = opts.holdingYears || 0;
    var assetSubType = opts.assetSubType || 'housing';
    var houseCount = opts.houseCount || 1;
    var isAdjustedArea = opts.isAdjustedArea || false;
    var isUnregistered = opts.isUnregistered || false;
    if (taxBase <= 0) return { rateType:'zero', rateDesc:'과세표준 없음', tax:0, surchargeRate:0 };
    if (isUnregistered) return { rateType:'unregistered', rateDesc:'미등기양도 (§104①10호)', tax:Math.floor(taxBase*0.70), surchargeRate:0 };
    var isHousing    = (assetSubType==='housing'||assetSubType==='housing_1h1h');
    var isNonBizLand = (assetSubType==='land_nonbusiness'||assetSubType==='land_nonbusiness_adj');
    var adjNonBiz    = (assetSubType==='land_nonbusiness_adj');
    var shortTermTax = 0, shortTermDesc = '';
    if (holdingYears < 1) {
      var r = isHousing ? 0.70 : 0.50;
      shortTermTax  = Math.floor(taxBase * r);
      shortTermDesc = isHousing ? '보유 1년 미만 주택 70% (§104①3호)' : '보유 1년 미만 50% (§104①3호)';
    } else if (holdingYears < 2) {
      var r2 = isHousing ? 0.60 : 0.40;
      shortTermTax  = Math.floor(taxBase * r2);
      shortTermDesc = isHousing ? '보유 1~2년 주택 60% (§104①2호)' : '보유 1~2년 40% (§104①2호)';
    }
    var basicTax = calcBasicTax(taxBase);
    var surcharge = 0, surchargeDesc = '';
    if (isHousing && isAdjustedArea) {
      if      (houseCount >= 3) { surcharge = 0.30; surchargeDesc = '조정지역 3주택이상 +30%p (§104⑦3호)'; }
      else if (houseCount === 2){ surcharge = 0.20; surchargeDesc = '조정지역 2주택 +20%p (§104⑦1호)'; }
    }
    if (isNonBizLand) { surcharge = 0.10; surchargeDesc = (adjNonBiz ? '조정지역 ' : '') + '비사업용토지 +10%p (§104①8호)'; }
    var surTax = basicTax + (surcharge > 0 ? Math.floor(taxBase * surcharge) : 0);
    var surDesc = surcharge > 0 ? '기본세율 (§55①) + ' + surchargeDesc : '기본세율 (§55①)';
    var finalTax  = (shortTermTax > 0 && shortTermTax > surTax) ? shortTermTax : surTax;
    var finalDesc = (shortTermTax > 0 && shortTermTax > surTax) ? shortTermDesc : surDesc;
    var rType = isUnregistered ? 'unregistered' : (surcharge > 0 ? 'heavy' : (shortTermTax > surTax ? 'shortterm' : 'basic'));
    return { rateType:rType, rateDesc:finalDesc, tax:finalTax, surchargeRate:surcharge };
  }

  function calcAll(input) {
    var steps = [];
    if (!input.transferPrice    || input.transferPrice <= 0)    throw new Error('양도가액을 입력해 주세요');
    if (!input.acquisitionPrice || input.acquisitionPrice <= 0) throw new Error('취득가액을 입력해 주세요');
    var holdingYears = calcHoldingYears(input.acquisitionDate, input.transferDate);
    steps.push({ label:'보유기간', detail:input.acquisitionDate+' ~ '+input.transferDate, value:holdingYears+'년', law:'§95④' });

    var exempt = false, exemptReason = '';
    if (input.is1h1h) {
      if (input.transferPrice <= 1200000000) {
        exempt = true; exemptReason = '1세대1주택 비과세 — 양도가액 12억 이하 (§89①3호)';
      } else {
        exemptReason = '1세대1주택이나 고가주택(12억 초과) — 초과분만 과세 (§89①3호 단서)';
      }
    }
    if (exempt) {
      steps.push({ label:'비과세', detail:exemptReason, value:'0원', law:'§89①3호' });
      return { exempt:true, exemptReason:exemptReason, holdingYears:holdingYears,
               transferGain:0, ltcDeduction:{applicable:false,rate:0}, ltcAmount:0,
               capitalGainAmt:0, basicDeduction:0, taxBase:0,
               taxResult:{rateDesc:'비과세',tax:0}, incomeTax:0, localTax:0, totalTax:0, steps:steps };
    }

    var totalCost = input.acquisitionPrice + (input.necessaryExpense || 0);
    var transferGain = input.transferPrice - totalCost;
    steps.push({ label:'① 양도차익', detail:'양도가액 '+fw(input.transferPrice)+' − 필요경비 '+fw(totalCost), value:fw(transferGain)+'원', law:'§100' });

    if (input.is1h1h && input.transferPrice > 1200000000) {
      var ratio = (input.transferPrice - 1200000000) / input.transferPrice;
      transferGain = Math.floor(transferGain * ratio);
      steps.push({ label:'   고가주택 안분', detail:'과세비율 = (양도가액-12억)/양도가액 = '+(ratio*100).toFixed(2)+'%', value:fw(transferGain)+'원', law:'§95③' });
    }

    if (transferGain <= 0) {
      steps.push({ label:'양도차손', detail:'양도차익이 0 이하 → 세액 없음', value:'0원', law:'§102' });
      return { exempt:false, exemptReason:exemptReason, holdingYears:holdingYears,
               transferGain:transferGain, ltcDeduction:{applicable:false,rate:0}, ltcAmount:0,
               capitalGainAmt:0, basicDeduction:0, taxBase:0,
               taxResult:{rateDesc:'양도차손',tax:0}, incomeTax:0, localTax:0, totalTax:0, steps:steps };
    }

    var ltcDeduction = { applicable:false, rate:0, holdingRate:0, residenceRate:0 };
    var ltcAmount = 0, ltcExcluded = false, ltcExcludeReason = '';
    if (input.isUnregistered) {
      ltcExcluded = true; ltcExcludeReason = '미등기 자산 → 장특공제 배제 (§95②)';
    } else if (input.isAdjustedArea && input.houseCount >= 2) {
      ltcExcluded = true; ltcExcludeReason = '조정지역 다주택 중과 → 장특공제 배제 (§95②)';
    } else {
      ltcDeduction = calcLtcDeduction(holdingYears, input.residenceYears||0, input.is1h1h ? 'housing_1h1h' : 'general');
      if (ltcDeduction.applicable) ltcAmount = Math.floor(transferGain * ltcDeduction.rate / 100);
    }
    var ltcDetail = ltcExcluded ? ltcExcludeReason
      : (ltcDeduction.applicable
          ? (input.is1h1h
              ? '보유'+ltcDeduction.holdingRate+'% + 거주'+ltcDeduction.residenceRate+'% = 합계'+ltcDeduction.rate+'%'
              : '일반 공제율 '+ltcDeduction.rate+'%')
          : '보유기간 3년 미만 → 공제 없음');
    steps.push({ label:'② 장기보유특별공제', detail:ltcDetail, value:'− '+fw(ltcAmount)+'원', law:'§95②', minus:true });

    var capitalGainAmt = transferGain - ltcAmount;
    steps.push({ label:'③ 양도소득금액', detail:fw(transferGain)+' − '+fw(ltcAmount), value:fw(capitalGainAmt)+'원', law:'§95①' });

    var basicDeduction = input.isUnregistered ? 0 : 2500000;
    steps.push({ label:'④ 양도소득 기본공제', detail:input.isUnregistered ? '미등기 → 공제 없음' : '연 250만원', value:'− '+fw(basicDeduction)+'원', law:'§103', minus:true });

    var taxBase = Math.max(0, capitalGainAmt - basicDeduction);
    steps.push({ label:'⑤ 과세표준', detail:fw(capitalGainAmt)+' − '+fw(basicDeduction), value:fw(taxBase)+'원', law:'§92②3호', highlight:true });

    var taxResult = calcTax({ taxBase:taxBase, holdingYears:holdingYears,
      assetSubType:input.assetSubType||'housing', houseCount:input.houseCount||1,
      isAdjustedArea:input.isAdjustedArea||false, isUnregistered:input.isUnregistered||false });
    steps.push({ label:'⑥ 양도소득 산출세액', detail:taxResult.rateDesc, value:fw(taxResult.tax)+'원', law:'§104, §55①' });

    var localTax = Math.floor(taxResult.tax * 0.10);
    steps.push({ label:'⑦ 지방소득세', detail:'산출세액 × 10%', value:fw(localTax)+'원', law:'지방세법§103의3' });

    var totalTax = taxResult.tax + localTax;
    steps.push({ label:'합계', detail:'양도소득세 + 지방소득세', value:fw(totalTax)+'원', law:'', highlight:true });

    return { exempt:false, exemptReason:exemptReason, holdingYears:holdingYears,
             transferGain:transferGain, ltcDeduction:ltcDeduction, ltcAmount:ltcAmount,
             capitalGainAmt:capitalGainAmt, basicDeduction:basicDeduction, taxBase:taxBase,
             taxResult:taxResult, incomeTax:taxResult.tax, localTax:localTax, totalTax:totalTax, steps:steps };
  }

  function fw(n) {
    if (typeof n !== 'number') return '0';
    return n.toLocaleString('ko-KR');
  }

  return { calcHoldingYears:calcHoldingYears, calcLtcDeduction:calcLtcDeduction,
           calcBasicTax:calcBasicTax, calcTax:calcTax, calcAll:calcAll, _fmt:fw };
}));
