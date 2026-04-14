#!/usr/bin/env python3
"""
LLM-assisted account code classifier.
Input: free-text description of a transaction
Output: suggested account code and name

Uses MiniMax API for LLM classification.
Falls back to keyword-based classification.
"""
import sys
import json
import os
from typing import Optional

# MiniMax API configuration
API_KEY = os.environ.get("MINIMAX_API_KEY", "")
API_BASE = "https://api.theclawbay.com/backend-api/codex"

# Default chart of accounts for keyword fallback
DEFAULT_ACCOUNTS = {
    "1100": ("Cash - Operating", ["cash", "bank", "deposit", "wire", "ach", "check"]),
    "1105": ("Cash - Payroll", ["payroll", "salary", "wages", "net pay"]),
    "1200": ("Accounts Receivable", ["receivable", "customer", "ar", "invoice"]),
    "1300": ("Inventory", ["inventory", "stock", "cogs", "cost of goods", "merchandise"]),
    "1400": ("Prepaid Expenses", ["prepaid", "advance", "premium"]),
    "1500": ("Fixed Assets", ["fixed asset", "equipment", "furniture", "computer", "vehicle", "building", "land"]),
    "1600": ("Accumulated Depreciation", ["depreciation", "accum", "amortization"]),
    "2000": ("Accounts Payable", ["payable", "vendor", "ap", "supplier", "invoice"]),
    "2100": ("Accrued Expenses", ["accrued", "accrue", "interest payable"]),
    "2200": ("Sales Tax Payable", ["sales tax", "tax payable", "vat", "gst"]),
    "2300": ("Payroll Tax Payable", ["payroll tax", "withholding", "fica", "federal unemployment"]),
    "2400": ("Deferred Revenue", ["deferred", "advance payment", "unearned"]),
    "2500": ("Notes Payable", ["note payable", "loan", "mortgage", "debt"]),
    "3000": ("Common Stock", ["common stock", "capital stock", "shares"]),
    "3100": ("Retained Earnings", ["retained earnings", "earnings", "profits"]),
    "3200": ("Dividends", ["dividend", "distribution"]),
    "4000": ("Sales Revenue", ["sales", "revenue", "income", "fee earned", "service revenue"]),
    "4100": ("Service Revenue", ["service", "consulting", "professional fee"]),
    "4200": ("Other Income", ["interest income", "gain", "other income"]),
    "4300": ("Sales Returns", ["return", "refund", "credit memo"]),
    "4400": ("Sales Discounts", ["discount", "allowance"]),
    "5000": ("Cost of Goods Sold", ["cogs", "cost of sales", "direct cost"]),
    "5100": ("Direct Labor", ["direct labor", "direct wages", "manufacturing labor"]),
    "6000": ("Rent Expense", ["rent", "lease"]),
    "6100": ("Salaries & Wages", ["salary", "wages", "payroll", "bonus", "commission"]),
    "6200": ("Payroll Taxes", ["payroll tax", "fica", "unemployment"]),
    "6300": ("Employee Benefits", ["benefits", "insurance", "health", "dental", "vision", "401k", "hsa", "fsa"]),
    "6400": ("Office Supplies", ["supplies", "office", "stationery"]),
    "6500": ("Bank Fees", ["bank fee", "service charge", "interest charge"]),
    "6600": ("Professional Services", ["professional", "legal", "accounting", "consulting", "contractor"]),
    "6700": ("Utilities", ["utilities", "electric", "gas", "water", "internet", "phone"]),
    "6800": ("Insurance", ["insurance", "liability", "property", "workers comp"]),
    "6900": ("Travel & Entertainment", ["travel", "meals", "entertainment", "lodging", "transportation"]),
    "7000": ("Marketing & Advertising", ["marketing", "advertising", "promotion", "seo", "ppc"]),
    "7100": ("Repairs & Maintenance", ["repair", "maintenance", "improvement"]),
    "7200": ("Depreciation Expense", ["depreciation", "depreciation expense"]),
    "7300": ("Interest Expense", ["interest expense", "interest paid", "loan interest"]),
    "7400": ("Income Tax Expense", ["income tax", "tax expense", "provision"]),
    "7500": ("Miscellaneous Expense", ["miscellaneous", "other expense", "sundry"]),
}

def keyword_classify(description: str) -> dict:
    """Fallback: keyword-based account classification."""
    desc_lower = description.lower()
    
    for code, (name, keywords) in DEFAULT_ACCOUNTS.items():
        for kw in keywords:
            if kw in desc_lower:
                return {"account_code": code, "account_name": name, "confidence": 0.5, "method": "keyword"}
    
    return {"account_code": "7500", "account_name": "Miscellaneous Expense", "confidence": 0.3, "method": "keyword_default"}

def llm_classify(description: str, api_key: str, api_base: str) -> Optional[dict]:
    """Use MiniMax LLM to classify the transaction into an account code."""
    if not api_key:
        return None
    
    try:
        import urllib.request
        import urllib.error
        
        prompt = f"""You are an expert bookkeeper. Given the transaction description below, classify it into the most appropriate general ledger account.

Available accounts (code: name):
1100: Cash - Operating
1105: Cash - Payroll
1200: Accounts Receivable
1300: Inventory
1400: Prepaid Expenses
1500: Fixed Assets
1600: Accumulated Depreciation
2000: Accounts Payable
2100: Accrued Expenses
2200: Sales Tax Payable
2300: Payroll Tax Payable
2400: Deferred Revenue
2500: Notes Payable
3000: Common Stock
3100: Retained Earnings
3200: Dividends
4000: Sales Revenue
4100: Service Revenue
4200: Other Income
4300: Sales Returns
4400: Sales Discounts
5000: Cost of Goods Sold
5100: Direct Labor
6000: Rent Expense
6100: Salaries & Wages
6200: Payroll Taxes
6300: Employee Benefits
6400: Office Supplies
6500: Bank Fees
6600: Professional Services
6700: Utilities
6800: Insurance
6900: Travel & Entertainment
7000: Marketing & Advertising
7100: Repairs & Maintenance
7200: Depreciation Expense
7300: Interest Expense
7400: Income Tax Expense
7500: Miscellaneous Expense

Transaction: "{description}"

Return ONLY valid JSON:
{{"account_code": "XXXX", "account_name": "Account Name", "confidence": 0.0-1.0}}

Choose the account that best describes the PRIMARY nature of this transaction. confidence 1.0 = very confident, 0.5 = moderately confident."""

        req = urllib.request.Request(
            api_base,
            data=json.dumps({
                "model": "MiniMax-M2.2",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 128,
                "temperature": 0.1
            }).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            content = result["choices"][0]["message"]["content"].strip()
            data = json.loads(content)
            data["method"] = "llm"
            return data
    except Exception:
        return None

def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)
    
    description = input_data.get("description", "")
    if not description:
        print(json.dumps({"error": "No description provided"}))
        sys.exit(1)
    
    # Try LLM first
    result = llm_classify(description, API_KEY, API_BASE)
    if not result:
        # Fall back to keyword
        result = keyword_classify(description)
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()