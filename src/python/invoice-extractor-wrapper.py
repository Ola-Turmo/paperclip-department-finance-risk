#!/usr/bin/env python3
"""
Invoice Extractor — PaddleOCR + MiniMax LLM
Input: JSON via stdin {"image_path": "...", "api_key": "..."}
Output: JSON to stdout only. Errors to stderr with non-zero exit.
"""
import sys
import json
import re

def extract_invoice(image_path, api_key):
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
        result = ocr.ocr(image_path)
        lines = [line[1][0] for line in result[0]] if result and result[0] else []
        full_text = "\n".join(lines)
    except ImportError:
        return {"success": False, "error": "dependency_missing:paddleocr"}
    except Exception as e:
        return {"success": False, "error": "ocr_error:" + str(e)}

    try:
        import requests

        system_prompt = (
            "You are an expert accounts payable clerk. Extract from this invoice and return ONLY valid JSON.\n"
            'Invoice JSON schema: {"vendor_name","vendor_address","invoice_number","invoice_date","due_date",'
            '"payment_terms","line_items":[{"description","quantity","unit_price","amount","account_code"}],'
            '"subtotal","tax_amount","total_amount","currency"}'
        )

        user_prompt = system_prompt + "\n\nInvoice text:\n" + full_text

        resp = requests.post(
            "https://api.theclawbay.com/backend-api/codex",
            headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
            json={
                "model": "MiniMax-M2.2",
                "messages": [{"role": "user", "content": user_prompt}],
                "max_tokens": 1024,
                "temperature": 0.1
            },
            timeout=30
        )
        data = resp.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        match = re.search(r'\{.*\}', text, re.DOTALL)
        invoice_data = json.loads(match.group() if match else text)
        return {"success": True, "data": invoice_data}
    except Exception as e:
        return {"success": False, "error": "llm_error:" + str(e)}

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = extract_invoice(
            input_data.get("image_path", ""),
            input_data.get("api_key", "")
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": "stdin_error:" + str(e)}), file=sys.stderr)
        sys.exit(1)
