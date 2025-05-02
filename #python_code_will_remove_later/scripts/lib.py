import datetime
import gzip
import hashlib
import os
import re
import glob
import sys
import textwrap
import gradio as gr
import numpy as np
import requests
import json
import base64
from io import BytesIO
from PIL import Image
from PIL import PngImagePlugin
import random
import argparse
from comfyui import run_comfyui, cancel_comfyui
from webui import run_webui, cancel_Webui
from color_transfer import ColorTransfer
from tag_autocomplete import PromptManager
from setup_wizard import setup_wizard_window
from custom_com import init_custom_com, set_custom_gallery_thumb_images, set_custom_gallery_image
from language import *
from metadata import SafetensorsMetadataReader
from websocket_client import send_websocket_message

LANG = LANG_CN
TITLE = "WAI Character Select SAA"
CAT = "WAI_Character_Select"
ENGLISH_CHARACTER_NAME = False
PROMPT_MANAGER = None
WSPORT = 47850

SAMPLER_COMFYUI = ["euler_ancestral", "euler", "euler_cfg_pp", "euler_ancestral_cfg_pp", "heun", "heunpp2","dpm_2", "dpm_2_ancestral",
                  "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_2s_ancestral_cfg_pp", "dpmpp_sde", "dpmpp_sde_gpu",
                  "dpmpp_2m", "dpmpp_2m_cfg_pp", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu", "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm",
                  "ipndm", "ipndm_v", "deis", "res_multistep", "res_multistep_cfg_pp", "res_multistep_ancestral", "res_multistep_ancestral_cfg_pp",
                  "gradient_estimation", "er_sde", "seeds_2", "seeds_3"]
SCHEDULER_COMFYUI = ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta", "linear_quadratic", "kl_optimal"] 

SAMPLER_WEBUI = ["Euler a", "Euler", "DPM++ 2M", "DPM++ SDE", "DPM++ 2M SDE", "DPM++ 2M SDE Heun", "DPM++ 2S a", "DPM++ 3M SDE",
                 "LMS", "Heun", "DPM2", "DPM2 a", "DPM fast", "DPM adaptive", "Restart"]
SCHEDULER_WEBUI = ["Automatic", "Uniform", "Karras", "Exponential", "Polyexponential", "SGM Uniform", "KL Optimal", "Align Your Steps", "Simple", "Normal", "DDIM", "Beta"]


SAMPLER = SAMPLER_COMFYUI
SCHEDULER = SCHEDULER_COMFYUI

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
json_folder = os.path.join(parent_dir, 'json')
image_outputs_folder = os.path.join(parent_dir, 'outputs')

character_list = ''
character_list_values = ''
character_dict = {}
tag_assist_dict = {}
original_character_list = ''
original_character_dict = {}
wai_image_dict = {}
view_tags = {}

no_local_settings = False
settings_json = {
    "remote_ai_base_url": "https://api.groq.com/openai/v1/chat/completions",
    "remote_ai_model": "llama-3.3-70b-versatile",
    "remote_ai_api_key":"<Your API Key here>",
    "remote_ai_timeout":30,
    
    "model_path": "F:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\models\\checkpoints",
    "model_path_2nd": "F:\\Stable-diffusion\\stable-diffusion-webui\\models\\Stable-diffusion",
    "model_filter": False,
    "model_filter_keyword": "waiNSFW,waiSHUFFLENOOB",
    "search_modelinsubfolder": False,
    
    "character1": "random",
    "character2": "none",
    "character3": "none",
    "tag_assist": False,
    
    "view_angle": "none",
    "view_camera": "none",
    "view_background": "none",
    "view_style": "none",
    
    "api_model_sampler" : "euler_ancestral", 
    "api_model_scheduler" : "normal",
    "api_model_file_select" : "default",    
    "random_seed": -1,
    
    "custom_prompt": "",
    "api_prompt": "masterpiece, best quality, amazing quality",
    "api_neg_prompt": "bad quality,worst quality,worst detail,sketch,censor,3d",
    "api_image_data": "7.0,30,1024,1360,1",
    "api_image_landscape": False,
    "keep_gallery": False,
    
    "batch_generate_rule": "Once",
    "ai_prompt": "",
    "prompt_ban" : "",
    
    "ai_interface": "none",
    "ai_local_addr": "http://127.0.0.1:8080/chat/completions",
    "ai_local_temp": 0.7,
    "ai_local_n_predict": 768,
    
    "api_interface": "none",
    "api_preview_refresh_time": 1,
    "api_addr": "127.0.0.1:7860",
    "api_webui_savepath_override": False,
    
    "api_hf_enable": False,
    "api_hf_scale": 1.5,
    "api_hf_denoise": 0.4,
    "api_hf_upscaler_list": ["ESRGAN_4x(W)", "R-ESRGAN 2x+(W)", "R-ESRGAN 4x+(W)", "R-ESRGAN 4x+ Anime6B(W)", "4x_NMKD-Siax_200k(C)", "8x_NMKD-Superscale_150000_G(C)", "4x-AnimeSharp(C)", "4x-UltraSharp(C)", "ESRGAN_4x(C)","RealESRGAN_x2(C)","RealESRGAN_x4(C)"],
    "api_hf_upscaler_selected": "R-ESRGAN 4x+(W)",
    "api_hf_colortransfer": "none",
    "api_hf_random_seed": False,
    
    "api_refiner_enable": False,
    "api_refiner_add_noise": True,
    "api_refiner_model": "none",
    "api_refiner_ratio": 0.4,
}

model_files_list = []
refiner_model_files_list = []

last_prompt = ''
last_info = ''
last_ai_text = ''
skip_next_generate = False
cancel_current_generate = False

wai_illustrious_character_select_files = [       
    {'name': 'settings', 'file_path': os.path.join(json_folder, 'settings.json'), 'url': 'local'},
    {'name': 'original_character', 'file_path': os.path.join(json_folder, 'original_character.json'), 'url': 'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/json/original_character.json'},
    {'name': 'view_tags', 'file_path': os.path.join(json_folder, 'view_tags.json'), 'url': 'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/json/view_tags.json'},
    {'name': 'wai_characters', 'file_path': os.path.join(json_folder, 'wai_characters.csv'), 'url':'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/json/wai_characters.csv'},
    {'name': 'wai_tag_assist', 'file_path': os.path.join(json_folder, 'wai_tag_assist.json'), 'url':'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/json/wai_tag_assist.json'},
    {'name': 'wai_character_thumbs', 'file_path': os.path.join(json_folder, 'wai_character_thumbs.json'), 'url': 'https://huggingface.co/datasets/flagrantia/character_select_stand_alone_app/resolve/main/wai_character_thumbs.json'},
    {'name': 'danbooru_tag', 'file_path': os.path.join(json_folder, 'danbooru.csv'), 'url': 'https://raw.githubusercontent.com/DominikDoom/a1111-sd-webui-tagcomplete/refs/heads/main/tags/danbooru.csv'},
]

def first_setup():
    if not no_local_settings:
        return False
    
    global SAMPLER
    global SCHEDULER
    
    wiz = setup_wizard_window()
    wiz.run(LANG["setup_greet_title"], LANG["setup_greet_message"])
    
    model_folder = wiz.get_string(LANG["setup_model_folder_title"], LANG["setup_model_folder"], settings_json["model_path"])
    if model_folder:
        print(f"model_folder: {model_folder}")
        settings_json["model_path"] = model_folder        
    else:
        print("model_folder: skipped")
    
    settings_json["model_filter"] = wiz.ask_yes_no(LANG["setup_model_filter_title"], LANG["setup_model_filter"])
    
    if settings_json["model_filter"]:
        model_filter_keyword = wiz.get_string(LANG["setup_model_filter_keyword_title"], LANG["setup_model_filter_keyword"], settings_json["model_filter_keyword"]) 
        if model_filter_keyword:
            print(f"model_filter_keyword: {model_filter_keyword}")
            settings_json["model_filter_keyword"] = model_filter_keyword
        else:
            print("model_filter_keyword: skipped")

    settings_json["search_modelinsubfolder"] = wiz.ask_yes_no(LANG["setup_search_modelinsubfolder_title"], LANG["setup_search_modelinsubfolder"])            
    
    get_safetensors()
    
    remote_ai_api_key = wiz.get_string(LANG["setup_remote_ai_api_key_title"], LANG["setup_remote_ai_api_key"], "<API KEY>")
    if remote_ai_api_key:
        print(f"remote_ai_api_key: {remote_ai_api_key}")
        settings_json["remote_ai_api_key"] = remote_ai_api_key
    else:
        print("remote_ai_api_key: skipped")
          
    api_interface = wiz.get_choice(LANG["setup_webui_comfyui_select_title"], LANG["setup_webui_comfyui_select"], "ComfyUI,WebUI,none", "none")
    if api_interface:
        print(f"api_interface: {api_interface}")
        settings_json["api_interface"] = api_interface
        if "WebUI" == api_interface:
            settings_json["api_model_sampler"] = SAMPLER_WEBUI[0]
            settings_json["api_model_scheduler"] = SCHEDULER_WEBUI[0]
        elif "ComfyUI" == api_interface:
            settings_json["api_model_sampler"] = SAMPLER_COMFYUI[0]
            settings_json["api_model_scheduler"] = SCHEDULER_COMFYUI[0]
    else:
        print("api_interface: none")            
        
    api_addr = wiz.get_string(LANG["setup_webui_comfyui_api_addr_title"], LANG["setup_webui_comfyui_api_addr"], settings_json["api_addr"])
    if api_addr:
        print(f"api_addr: {api_addr}")
        settings_json["api_addr"] = api_addr
    else:
        print("api_addr: skipped")        

    wiz.run(LANG["setup_webui_comfyui_title"], LANG["setup_webui_comfyui"])

    save_json(settings_json, 'settings.json')    
    return True
 
def get_url_by_name(name):
    for item in wai_illustrious_character_select_files:
        if item['name'] == name:
            return item['url'], item['file_path']
    return None, None

def decode_response(response):
    if response.status_code == 200:
        ret = response.json().get('choices', [{}])[0].get('message', {}).get('content', '')
        print(f'[{CAT}]:Response:{ret}')
        # Renmove <think> for DeepSeek
        if str(ret).__contains__('</think>'):
            ret = str(ret).split('</think>')[-1].strip()
            print(f'\n[{CAT}]:Trimed response:{ret}')    
            
        ai_text = ret.strip()
        ai_text = ai_text.replace('"','').replace('*','')
                
        if ai_text.endswith('.'):
            ai_text = ai_text[:-1] + ','      
        if not ai_text.endswith(','):
            ai_text = f'{ai_text},'            
        return ai_text    
    else:
        ret = LANG["gr_warning_creating_ai_prompt"].format(response.status_code, '')
        print(f"[{CAT}]:{ret}")
        gr.Warning(ret)
        return ''

def llm_send_request(input_prompt, remote_ai_base_url, remote_ai_model, remote_ai_timeout):
    data = {
            'model': remote_ai_model,
            'messages': [
                {"role": "system", "content": LANG["ai_system_prompt"]},
                {"role": "user", "content": input_prompt + ";Response in English"}
            ],  
        }
    
    try:
        response = requests.post(remote_ai_base_url, headers={"Content-Type": "application/json", "Authorization": "Bearer " + settings_json["remote_ai_api_key"]}, json=data, timeout=remote_ai_timeout)
        if 200 == response.status_code:
            return decode_response(response)
        else:
            ret = LANG["gr_warning_creating_ai_prompt"].format('response.status_code', response.status_code)
            print(f"[{CAT}]:{ret}")
            gr.Warning(ret)
            return ''
            
    except Exception as e:
        ret = LANG["gr_warning_creating_ai_prompt"].format('Exception:', e)
        print(f"[{CAT}]:{ret}")
        gr.Warning(ret)
    
    return ''

def llm_send_local_request(input_prompt, server, temperature=0.5, n_predict=512):
    data = {
            "temperature": temperature,
            "n_predict": n_predict,
            "cache_prompt": True,
            "stop": ["<|im_end|>"],
            'messages': [
                {"role": "system", "content": LANG["ai_system_prompt"]},
                {"role": "user", "content": input_prompt + ";Response in English"}
            ],  
        }
    try:
        response = requests.post(server, headers={"Content-Type": "application/json"}, json=data)    
        if 200 == response.status_code:
            return decode_response(response)
        else:
            ret = LANG["gr_warning_creating_ai_prompt"].format(response.status_code, e)
            print(f"[{CAT}]:{ret}")
            gr.Warning(ret)
            return ''
    except Exception as e:
        ret = LANG["gr_warning_creating_ai_prompt"].format('Exception:', e)
        print(f"[{CAT}]:{ret}")
        gr.Warning(ret)
    
    return ''

def manual_update_database(hide=''):
    global wai_image_dict
    global PROMPT_MANAGER
    
    if ''== hide:
        return gr.Button(visible=False)
    
    try:               
        file_list = ["danbooru_tag", "wai_character_thumbs"]
        
        for name in file_list:
            url, file_path = get_url_by_name(name)
            if  None != url:
                gr.Info(LANG["gr_info_manual_update_database"].format(name), duration=15)
                if os.path.exists(file_path):
                    os.unlink(file_path)
                    
                download_file(url, file_path)                
                if 'wai_character_thumbs' == name:
                    with open(file_path, 'r', encoding='utf-8') as file:
                        wai_image_dict = json.load(file)
                elif 'danbooru_tag' == name:
                    PROMPT_MANAGER.reload_data()
                gr.Info(LANG["gr_info_manual_update_database_done"].format(name), duration=15)
            else:
                gr.Warning(LANG["gr_warning_manual_update_database"].format(name))        
    except Exception as e:
        gr.Warning(LANG["gr_warning_manual_update_database"].format(e))
        
    return gr.Button(value=LANG["manual_update_database"], variant='primary')

def download_file(url, file_path):   
    response = requests.get(url)
    response.raise_for_status() 
    print(f'[{CAT}]:Downloading... {url}')
    with open(file_path, 'wb') as file:
        file.write(response.content)        

def get_md5_hash(input_str):
    md5_hash = hashlib.md5()
    md5_hash.update(input_str.encode('utf-8'))
    return md5_hash.hexdigest()

def base64_to_image(base64_data):
    compressed_data = base64.b64decode(base64_data)
    webp_data = gzip.decompress(compressed_data)
    image = Image.open(BytesIO(webp_data))  
    return image

def get_safetensors_files(directory, search_subfolder):
    if not os.path.isdir(directory):
        print(f'[{CAT}]:{directory} not exist, use default')
        return []
    
    if search_subfolder:
        safetensors_files = glob.glob(os.path.join(directory, '**', '*.safetensors'), recursive=True)
    else:
        safetensors_files = glob.glob(os.path.join(directory, '*.safetensors'))
        
    safetensors_filenames = [os.path.relpath(file, directory) for file in safetensors_files]
    
    return safetensors_filenames

def get_safetensors():
    global model_files_list
    global refiner_model_files_list
    
    model_files_list=[]
    refiner_model_files_list=[]
    files_list = get_safetensors_files(settings_json["model_path"], settings_json["search_modelinsubfolder"])
    
    if len(files_list) > 0:
        keywords = [keyword.strip() for keyword in settings_json["model_filter_keyword"].split(',')]
        
        for model in files_list:
            if settings_json["model_filter"]:                
                if any(keyword in model for keyword in keywords):
                    model_files_list.append(model)
            else:
                model_files_list.append(model)        
            refiner_model_files_list.append(model)
    model_files_list.insert(0, 'default')    
    refiner_model_files_list.insert(0, 'none')

def save_json(now_settings_json, file_name):
    tmp_file = os.path.join(json_folder, file_name)
    with open(tmp_file, 'w', encoding='utf-8') as f:
        json.dump(now_settings_json, f, ensure_ascii=False, indent=4)
            
    print(f"[{CAT}]:Json saved to {tmp_file}")
    return tmp_file

def load_settings(temp_settings_json):    
    for key, value in temp_settings_json.items():
        if settings_json.__contains__(key):
            #print(f'[{CAT}] Settings: Load [{key}] : [{value}]')
            settings_json[key] = value
        else:
            print(f'[{CAT}] Settings: Ignore Unknown [{key}] : [{value}]')    

def load_text_file(file_path):
    raw_text = ''
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as js_file:
            raw_text = js_file.read()
    else:
        print(f"[{CAT}] ERROR: {file_path} file missing!!!")

    return raw_text
            
def load_jsons():
    global character_list
    global character_list_values
    global character_dict
    global original_character_dict
    global original_character_list
    global wai_image_dict
    global settings_json    
    global view_tags
    global tag_assist_dict
    global PROMPT_MANAGER
    global no_local_settings
    
    # download file
    for item in wai_illustrious_character_select_files:
        name = item['name']
        file_path = item['file_path']
        url = item['url']        
            
        if 'local' == url:
           if 'settings' == name and not os.path.exists(file_path):
                print(f'[{CAT}] Settings: Local settings.json not found, use default.')
                no_local_settings = True                
                continue
        else:
            if not os.path.exists(file_path):
                download_file(url, file_path)
        
        if 'danbooru_tag' == name:
            zh_cn = os.path.join(json_folder, 'danbooru_zh_cn.csv')
            PROMPT_MANAGER = PromptManager(file_path, zh_cn, not ENGLISH_CHARACTER_NAME)
            print(f"[{CAT}]:PROMPT_MANAGER initialized.")
            continue    

        with open(file_path, 'r', encoding='utf-8') as file:
            if 'original_character' == name:
                original_character_dict.update(json.load(file))   
            elif 'settings' == name:
                temp_settings_json = {}
                temp_settings_json.update(json.load(file))
                load_settings(temp_settings_json)
            elif 'view_tags' == name:
                view_tags.update(json.load(file))
            elif 'wai_characters' == name:
                lines = file.readlines()
                for line in lines:
                    #print(f'Loading {line}')
                    key, value = line.split(',')
                    character_dict[key.strip()]=value.strip()
            elif 'wai_tag_assist' == name:
                tag_assist_dict.update(json.load(file))
            elif 'wai_character_thumbs' == name:
                wai_image_dict = json.load(file)            
                                        
    # Create list        
    view_tags['angle'].insert(0, "none")
    view_tags['angle'].insert(0, "random")
    view_tags['camera'].insert(0, "none")
    view_tags['camera'].insert(0, "random")
    view_tags['background'].insert(0, "none")
    view_tags['background'].insert(0, "random")
    view_tags['style'].insert(0, "none")
    view_tags['style'].insert(0, "random")
                
    if ENGLISH_CHARACTER_NAME:
        character_list = list(character_dict.values())   
        character_list_values = list(character_dict.values())
    else:
        character_list = list(character_dict.keys())   
        character_list_values = list(character_dict.values())   
    
    character_list.insert(0, "none")
    character_list.insert(0, "random")
    character_list_values.insert(0, "none")
    character_list_values.insert(0, "random")
    
    original_character_list = list(original_character_dict.keys())    
    original_character_list.insert(0, "none")
    original_character_list.insert(0, "random")    
                            
    # Search models
    get_safetensors()
            
def remove_duplicates(input_string):
    items = input_string.split(',')    
    unique_items = list(dict.fromkeys(item.strip() for item in items))    
    result = ', '.join(unique_items)
    return result

def illustrious_character_select_ex(character = 'random', optimise_tags = True, random_action_seed = 1, tag_assist=False):
    chara = ''
    rnd_character = ''
    
    if 'none' == character or '' == character or not character:
        return '', '', None, ''
    
    if 'random' == character:
        index = random_action_seed % len(character_list)
        rnd_character = character_list[index]
        if 'random' == rnd_character:
            rnd_character = character_list[index+2]
        elif 'none' == rnd_character:
            rnd_character = character_list[index+1]
    else:
        rnd_character = character
        
    try:
        if ENGLISH_CHARACTER_NAME:        
            chara = rnd_character
        else:
            chara = character_dict[rnd_character]
    except KeyError:
        #print(f'[{CAT}]:KeyError: {rnd_character} not found in character_dict')
        # Solve JS issue
        return '', '', None, ''
        
    tas=''
    if tag_assist and tag_assist_dict.__contains__(chara):        
        tas=tag_assist_dict[chara]
        print(f'{CAT}:Tag assist: [{chara}] add [{tas}]')
        gr.Warning(LANG["gr_info_tag_assist_add"].format(tas, chara))
        
    md5_chara = get_md5_hash(chara.replace('(','\\(').replace(')','\\)'))
    thumb_image = None
    if wai_image_dict.keys().__contains__(md5_chara):
        thumb_image = wai_image_dict.get(md5_chara)
    
    opt_chara = chara
    if optimise_tags:
        opt_chara = opt_chara.replace('(', '\\(').replace(')', '\\)')  
        #print(f'{CAT}:Optimise Tags:[{chara}]->[{opt_chara}]')
    
    if not opt_chara.endswith(','):
        opt_chara = f'{opt_chara},'   
            
    return rnd_character, opt_chara, thumb_image, tas

def original_character_select_ex(character = 'random', random_action_seed = 1):
    chara = ''
    rnd_character = ''
    
    if 'none' == character:
        return '', ''
    
    if 'random' == character:
        index = random_action_seed % len(original_character_list)
        rnd_character = original_character_list[index]
        if 'random' == rnd_character:
            rnd_character = original_character_list[index+2]
        elif 'none' == rnd_character:
            rnd_character = original_character_list[index+1]
    else:
        rnd_character = character
    chara = original_character_dict[rnd_character]                                    
    
    opt_chara = chara
    if not opt_chara.endswith(','):
        opt_chara = f'{opt_chara},'   
            
    return rnd_character, opt_chara

def parse_api_image_data(api_image_data,api_image_landscape):
    try:
        cfg, steps, width, height, loops = map(float, api_image_data.split(','))
        if 1 > int(loops) or 128 < int(loops):
            loops = 1
        if not api_image_landscape:
            return float(cfg), int(steps), int(width), int(height), int(loops)
        else:
            return float(cfg), int(steps), int(height), int(width), int(loops)
    except ValueError:
        gr.Warning(LANG["gr_warning_cfgstepwh_mismatch"])
        return 7.0, 30, 1024, 1360, 1

def create_prompt_info(rnd_character1, opt_chara1, tas1,
                        rnd_character2, opt_chara2, tas2,
                        rnd_character3, opt_chara3, tas3,
                        rnd_oc, opt_oc):
    info = ''    
    if '' != opt_chara1:
        info += f'Character 1:{rnd_character1}[{opt_chara1}]\n'
        if ''!= tas1:
            tas1=f'{tas1},'
            info += f'Character 1 tag assist:[{tas1}]\n'
        
    if '' != opt_chara2:
        info += f'Character 2:{rnd_character2}[{opt_chara2}]\n'
        if ''!= tas2:
            tas2=f'{tas2},'
            info += f'Character 2 tag assist:[{tas2}]\n'
    
    if '' != opt_chara3:
        info += f'Character 3:{rnd_character3}[{opt_chara3}]\n'
        if ''!= tas3:
            tas2=f'{tas3},'
            info += f'Character 3 tag assist:[{tas3}]\n'

    if '' != rnd_oc:
        info += f'Original Character:{rnd_oc}[{opt_oc}]\n'

    prompt = f'{tas1}{opt_chara1}{tas2}{opt_chara2}{tas3}{opt_chara3}{opt_oc}'

    return prompt, info

def create_image(interface, refresh_time, addr, model_sampler, model_scheduler, model_file_select, prompt, neg_prompt, 
                 seed, cfg, steps, width, height, 
                 api_hf_enable, ai_hf_scale, ai_hf_denoise, api_hf_upscaler_selected, api_hf_colortransfer, api_webui_savepath_override, hf_random_seed,
                 refiner_enable, refiner_add_noise, refiner_model, refiner_ratio):
    def convert_to_condensed_format(data, hf_enable, refiner_enable):
        # Ensure data is a dictionary by parsing it if it's a string
        if isinstance(data, str):
            data = json.loads(data)
        elif not isinstance(data, dict):
            print(f"[{CAT}]Color Transfer:Input must be a string (JSON) or dictionary")
            return ""
        
        # Extract main prompt components
        main_prompt = data["prompt"]
        negative_prompt = data["negative_prompt"]
        
        # Extract key generation parameters with fallbacks
        steps = data["steps"]
        sampler = data.get("sampler_name", "Euler a")
        cfg_scale = data["cfg_scale"]
        seed = data["seed"]
        width = data["width"]
        height = data["height"]
        
        # Model and VAE parameters
        model_hash = data.get("sd_model_hash", "unknown")
        model = data.get("sd_model_name", "unknown")
        vae_hash = data.get("sd_vae_hash", "unknown")
        vae = data.get("sd_vae_name", "unknown")
        denoising = data["denoising_strength"]
        clip_skip = data.get("clip_skip", 2)        
        
        # High-resolution parameters from extra_generation_params
        extra_params = data.get("extra_generation_params", {})
        hires_upscale = extra_params.get("Hires upscale", 1.2)  # Using value from your input
        hires_steps = extra_params.get("Hires steps", 20)
        hires_upscaler = extra_params.get("Hires upscaler", "R-ESRGAN 4x+")
        downcast = extra_params.get("Downcast alphas_cumprod", True)
        version = data.get("version", "unknown")
        refiner = extra_params.get("Refiner", "none")
        refiner_switch_at = extra_params.get("Refiner switch at", 0)
        

        # Construct the condensed format
        condensed = f"{main_prompt}\n"
        condensed += f"Negative prompt: {negative_prompt}\n"
        condensed += f"Steps: {steps}, Sampler: {sampler}, Schedule type: Automatic, CFG scale: {cfg_scale}, Seed: {seed}, "
        condensed += f"Size: {width}x{height}, Model hash: {model_hash}, Model: {model}, "        
        if hf_enable:
            condensed += f"VAE hash: {vae_hash}, VAE: {vae}, Denoising strength: {denoising}, Clip skip: {clip_skip}, "
            condensed += f"Hires upscale: {hires_upscale}, Hires steps: {hires_steps}, Hires upscaler: {hires_upscaler}, "
        else:
            condensed += f"VAE hash: {vae_hash}, VAE: {vae}, Clip skip: {clip_skip}, "
        
        if refiner_enable:
            condensed += f"Downcast alphas_cumprod: {downcast}, Refiner: {refiner}, Refiner switch at: {refiner_switch_at}, Version: {version}"
        else:
            condensed += f"Downcast alphas_cumprod: {downcast}, Version: {version}"

        return condensed
    
    global cancel_current_generate
    if 'none' != interface:
        api_image = None
        src_info = ''
        current_time = None
        
        ret = 'success'
        if 'ComfyUI' == interface:
            if api_hf_enable: 
                if not str(api_hf_upscaler_selected).__contains__('(C)'):
                    print(f"[{CAT}]Reset {api_hf_upscaler_selected} to 4x-UltraSharp")
                    api_hf_upscaler_selected = '4x-UltraSharp'
                    gr.Warning(LANG["api_hf_incorrect_upscaler"].format(api_hf_upscaler_selected))
                else:
                    api_hf_upscaler_selected = str(api_hf_upscaler_selected).replace('(C)', '')
            
            try:
                image_data_list = run_comfyui(server_address=addr, preview_refresh_time=refresh_time, sampler=model_sampler, scheduler=model_scheduler, model_name=model_file_select, 
                                            positive_prompt=prompt, negative_prompt=neg_prompt, random_seed=seed, cfg=cfg, steps=steps, width=width, height=height,
                                            hf_enable=api_hf_enable, hf_scale=ai_hf_scale, hf_denoising_strength=ai_hf_denoise, hf_upscaler=api_hf_upscaler_selected, hf_colortransfer=api_hf_colortransfer, hf_seed=hf_random_seed,
                                            refiner_enable = refiner_enable, refiner_add_noise=refiner_add_noise, refiner_model_name=refiner_model, refiner_ratio=refiner_ratio, ws_port=WSPORT
                                            )
                if not cancel_current_generate:
                    image_data_bytes = bytes(image_data_list)  
                    api_image = Image.open(BytesIO(image_data_bytes))
                else:
                    cancel_current_generate = False                    
                    api_image = None
                return api_image, ret
                        
            except Exception as ret_info:
                ret = LANG["gr_error_creating_image"].format(ret_info, interface)      
                api_image = None
                                                   
        elif 'WebUI' == interface:                
            metadata = PngImagePlugin.PngInfo()                            
            current_time = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")   
            
            if api_hf_enable: 
                if not str(api_hf_upscaler_selected).__contains__('(W)'):
                    print(f"[{CAT}]Reset {api_hf_upscaler_selected} to R-ESRGAN 4x+")
                    api_hf_upscaler_selected = 'R-ESRGAN 4x+'
                    gr.Warning(LANG["api_hf_incorrect_upscaler"].format(api_hf_upscaler_selected))
                else:
                    api_hf_upscaler_selected = str(api_hf_upscaler_selected).replace('(W)', '')                        

                if 'none' == api_hf_colortransfer:
                    api_image, _, src_info = run_webui(server_address=addr, ws_port=WSPORT, preview_refresh_time=refresh_time, sampler=model_sampler, scheduler=model_scheduler, model_name=model_file_select, 
                                            positive_prompt=prompt, negative_prompt=neg_prompt, random_seed=seed, cfg=cfg, steps=steps, width=width, height=height,
                                            hf_enable=api_hf_enable, hf_scale=ai_hf_scale, hf_denoising_strength=ai_hf_denoise, hf_upscaler=api_hf_upscaler_selected, savepath_override=api_webui_savepath_override,
                                            refiner_enable = refiner_enable, refiner_model_name=refiner_model, refiner_ratio=refiner_ratio)    
                else:                   
                    api_image, _, src_info = run_webui(server_address=addr, ws_port=WSPORT, preview_refresh_time=refresh_time, sampler=model_sampler, scheduler=model_scheduler, model_name=model_file_select, 
                                        positive_prompt=prompt, negative_prompt=neg_prompt, random_seed=seed, cfg=cfg, steps=steps, width=width, height=height,
                                        hf_enable=api_hf_enable, hf_scale=ai_hf_scale, hf_denoising_strength=ai_hf_denoise, hf_upscaler=api_hf_upscaler_selected, savepath_override=api_webui_savepath_override,
                                        refiner_enable = refiner_enable, refiner_model_name=refiner_model, refiner_ratio=refiner_ratio) 

                    if not cancel_current_generate:
                        gr.Warning(LANG["gr_info_color_transfer_webui"])                                    
                        ref_image, _, ref_info = run_webui(server_address=addr, ws_port=WSPORT, preview_refresh_time=refresh_time, sampler=model_sampler, scheduler=model_scheduler, model_name=model_file_select, 
                                                positive_prompt=prompt, negative_prompt=neg_prompt, random_seed=seed, cfg=cfg, steps=steps, width=width, height=height,
                                                hf_enable=False, hf_scale=ai_hf_scale, hf_denoising_strength=ai_hf_denoise, hf_upscaler=api_hf_upscaler_selected, savepath_override=api_webui_savepath_override,
                                                refiner_enable = refiner_enable, refiner_model_name=refiner_model, refiner_ratio=refiner_ratio)
                        
                        if not cancel_current_generate:
                            PT = ColorTransfer()        
                            if "Mean" == api_hf_colortransfer:
                                s = np.array(api_image).astype(np.float32)     
                                r = np.array(ref_image).astype(np.float32)       
                                api_image = Image.fromarray(PT.mean_std_transfer(img_arr_in=s, img_arr_ref=r))
                            elif "Lab" == api_hf_colortransfer:
                                s = np.array(api_image).astype(np.uint8)     
                                r = np.array(ref_image).astype(np.uint8)       
                                api_image = Image.fromarray(PT.lab_transfer(img_arr_in=s, img_arr_ref=r))     
                                                                                                                
                            image_filename = f"{current_time}_{seed}_reference.png"
                            image_filepath = os.path.join(image_outputs_folder, image_filename)
                            ref_para = convert_to_condensed_format(''.join(ref_info), False, refiner_enable)
                            metadata.add_text("parameters", ref_para)                        
                            ref_image.save(image_filepath, pnginfo=metadata)
                            print(f"[{CAT}]Color Transfer: Reference Image saved to {image_filepath}")        
            else:
                api_image, _, src_info = run_webui(server_address=addr, ws_port=WSPORT, preview_refresh_time=refresh_time, sampler=model_sampler, scheduler=model_scheduler, model_name=model_file_select, 
                                        positive_prompt=prompt, negative_prompt=neg_prompt, random_seed=seed, cfg=cfg, steps=steps, width=width, height=height,
                                        hf_enable=api_hf_enable, hf_scale=ai_hf_scale, hf_denoising_strength=ai_hf_denoise, hf_upscaler=api_hf_upscaler_selected, savepath_override=api_webui_savepath_override,
                                        refiner_enable = refiner_enable, refiner_model_name=refiner_model, refiner_ratio=refiner_ratio)                 
                        
            if api_image and not cancel_current_generate:
                if api_webui_savepath_override or ('none' != api_hf_colortransfer and not api_webui_savepath_override and api_hf_enable):
                    if not api_webui_savepath_override:
                        gr.Warning(LANG["gr_info_color_transfer_webui_warning"])
                        
                    image_filename = f"{current_time}_{seed}.png"
                    image_filepath = os.path.join(image_outputs_folder, image_filename)                        
                    str_para = convert_to_condensed_format(''.join(src_info), api_hf_enable, refiner_enable)
                    metadata.add_text("parameters", str_para)       
                    api_image.save(image_filepath, pnginfo=metadata)                        
                    print(f"[{CAT}]WebUI: Image saved to {image_filepath}")                                                                    
                return api_image, ret
            
        if not cancel_current_generate:
            ret = LANG["gr_error_creating_image"].format(src_info, interface)            
            gr.Warning(ret)
            return None, ret
        
        cancel_current_generate = False                    
        return None, ret
    
    return None, LANG["gr_warning_interface_both_none"]

def create_view_tag(view_list, in_tag, seed):
    if 'none' == in_tag:
        out_tag = ''
    elif 'random' == in_tag:
        index = seed % len(view_tags[view_list])
        if 'none' == view_tags[view_list][index]:
            index = index + 1
        elif 'random' == view_tags[view_list][index]:
            index = index + 2
        out_tag = f'{view_tags[view_list][index]}, '
    else:
        out_tag = f'{in_tag}, '
    
    out_tag = out_tag.replace('(','\\(').replace(')','\\)')    
    return out_tag

def create_view_tags(view_angle, view_camera, view_background, view_style, seed):
    tag_angle = create_view_tag('angle', view_angle, seed)
    tag_camera = create_view_tag('camera', view_camera, seed)
    tag_background = create_view_tag('background', view_background, seed)
    tag_style = create_view_tag('style', view_style, seed)
        
    return tag_angle, tag_camera, tag_background, tag_style

rnd_character_list = []
opt_chara_list = []
rnd_oc_list = []
opt_oc_list = []
tag_assist_list = []
seed_list = []

def create_characters(batch_random, character1, character2, character3, tag_assist, original_character, random_seed, api_image_data, api_image_landscape):
    global rnd_character_list
    global opt_chara_list
    global rnd_oc_list
    global opt_oc_list
    global tag_assist_list
    global seed_list
    
    rnd_character_list = []
    opt_chara_list = []
    rnd_oc_list = []
    opt_oc_list = []
    tag_assist_list = []
    seed_list = []
    
    generated_thumb_image_list = []
    _, _, _, _, loops = parse_api_image_data(api_image_data, api_image_landscape)
    
    if not batch_random:
        loops = 1
    
    rnd_character = [''] * 3
    opt_chara = [''] * 3
    thumb_image = [None] * 3
    tas = [''] * 3
    rnd_seed = [0] * 3
    characters = [character1, character2, character3]
    for _ in range(0, loops):
        if random_seed == -1:
            rnd_seed[0] = random.randint(0, 4294967295)
        else :
            rnd_seed[0] = random_seed
        rnd_seed[1] = int(rnd_seed[0] / 3)
        rnd_seed[2] = int(rnd_seed[0] / 7)
        seed_list.append(rnd_seed[0])
        oc_seed = 4294967295 - rnd_seed[0]

        rnd_oc, opt_oc = original_character_select_ex(character = original_character, random_action_seed=oc_seed)
        rnd_oc_list.append(rnd_oc)
        opt_oc_list.append(opt_oc)
        
        for index in range(0,3):
            rnd_character[index], opt_chara[index], thumb_image[index], tas[index] = illustrious_character_select_ex(character = characters[index], random_action_seed=rnd_seed[index], tag_assist=tag_assist)        
        
        for index in range(0,3):
            rnd_character_list.append(rnd_character[index])
            opt_chara_list.append(opt_chara[index])            
            tag_assist_list.append(tas[index])
            if thumb_image[index]:
                generated_thumb_image_list.append(thumb_image[index])
    
    js_generated_thumb_image_list = set_custom_gallery_thumb_images(generated_thumb_image_list)
    return js_generated_thumb_image_list        
    
def create_prompt_ex(batch_random, view_angle, view_camera, view_background, view_style, custom_prompt, keep_gallery,
                                 ai_interface, ai_prompt, batch_generate_rule, prompt_ban, remote_ai_base_url, remote_ai_model, remote_ai_timeout,
                                 ai_local_addr, ai_local_temp, ai_local_n_predict, ai_system_prompt_text,
                                 api_interface, api_preview_refresh_time, api_addr, api_prompt, api_neg_prompt, api_image_data, api_image_landscape,
                                 api_model_sampler, api_model_scheduler, api_model_file_select,
                                 api_hf_enable, api_hf_scale, api_hf_denoise, api_hf_upscaler_selected, api_hf_colortransfer, api_webui_savepath_override, api_hf_random_seed,
                                 api_refiner_enable, api_refiner_add_noise, api_refiner_model_list, api_refiner_ratio
            ) -> tuple[str, str, Image.Image, Image.Image]:            
    global last_prompt
    global last_info
    global last_ai_text
    global LANG
    global skip_next_generate
    
    cfg, steps, width, height, loops = parse_api_image_data(api_image_data, api_image_landscape)
    if '' != custom_prompt and not (custom_prompt.endswith(', ') or custom_prompt.endswith(',')):
        custom_prompt = f'{custom_prompt},'
    
    final_infos = []
        
    if not batch_random:
        loops = 1
        
    if 'none' == ai_interface == api_interface:
        gr.Warning(LANG["gr_warning_interface_both_none"])
        
    ai_text=''
    LANG["ai_system_prompt"] = textwrap.dedent(ai_system_prompt_text)
    if 'none' != batch_generate_rule:  
        if 'none' != ai_interface:
            ai_text = last_ai_text
            
        if 'Last' != batch_generate_rule:
            LANG["ai_system_prompt"] = textwrap.dedent(ai_system_prompt_text)
            if 'Remote' == ai_interface:
                ai_text = llm_send_request(ai_prompt, remote_ai_base_url, remote_ai_model, remote_ai_timeout)
            elif 'Local' == ai_interface:
                ai_text = llm_send_local_request(ai_prompt, ai_local_addr, ai_local_temp, ai_local_n_predict)     
                    
    skip_next_generate = False
    js_ret = ""
    for index in range(1, loops + 1):
        if skip_next_generate:
            skip_next_generate = False
            break
        
        rnd_character = ['','','']
        opt_chara = ['','','']
        tas = ['','','']
        rnd_oc = ''
        opt_oc = ''
        seed1 = seed_list[(index-1)]
        for count in range(0, 3):
            rnd_character[count] = rnd_character_list[int(3)*(index-int(1)) + count]
            opt_chara[count] = opt_chara_list[3*(index-1) + count]
            tas[count] = tag_assist_list[3*(index-1) + count]
        rnd_oc = rnd_oc_list[(index-1)]
        opt_oc = opt_oc_list[(index-1)]
                    
        prompt, info = create_prompt_info(rnd_character[0], opt_chara[0], tas[0],
                                          rnd_character[1], opt_chara[1], tas[1],
                                          rnd_character[2], opt_chara[2], tas[2],
                                          rnd_oc, opt_oc)   
        
        if 'none' != ai_interface or 'none' != api_interface:
            gr.Info(LANG["gr_info_create_n"].format(index, loops))
        
        if 1 != index and 'Every' == batch_generate_rule:
            if 'Remote' == ai_interface:
                ai_text = llm_send_request(ai_prompt, remote_ai_base_url, remote_ai_model, remote_ai_timeout)
            elif 'Local' == ai_interface:
                ai_text = llm_send_local_request(ai_prompt, ai_local_addr, ai_local_temp, ai_local_n_predict)         
                
        tag_angle, tag_camera, tag_background, tag_style = create_view_tags(view_angle, view_camera, view_background, view_style, seed1)            
        to_image_create_prompt = f'{custom_prompt}{tag_angle}{tag_camera}{tag_background}{tag_style}{prompt}{ai_text}{api_prompt}'
        for ban_word in prompt_ban.split(','):
            to_image_create_prompt = to_image_create_prompt.replace(ban_word.strip(), '')

        hf_random_seed = seed1
        if api_hf_random_seed:
            hf_random_seed = random.randint(0, 4294967295)
            
        api_image, js_ret = create_image(api_interface, api_preview_refresh_time, api_addr, api_model_sampler, api_model_scheduler, api_model_file_select, to_image_create_prompt, api_neg_prompt, 
                                seed1, cfg, steps, width, height, 
                                api_hf_enable, api_hf_scale, api_hf_denoise, api_hf_upscaler_selected, api_hf_colortransfer, api_webui_savepath_override, hf_random_seed,
                                api_refiner_enable, api_refiner_add_noise, api_refiner_model_list, api_refiner_ratio
                                )
        final_info = f'{index}:\nCustom Promot:[{custom_prompt}]\nTags:[{tag_angle}{tag_camera}{tag_background}{tag_style}]\n{info}\nAI Prompt:[{ai_text}]\nSeed:[{seed1}]\n'        
        if api_hf_enable and api_hf_random_seed:
            final_info += f'Hires Fix Seed:[{hf_random_seed}]\n\n'
        else:
            final_info += f'\n'
        final_infos.append(final_info)
        
        # Collect prompts
        last_prompt = prompt
        last_info = info
        last_ai_text = ai_text          

        if api_image:            
            base64_image = set_custom_gallery_image(api_image)
            packed_json = json.dumps({
                            "command": "final_image",
                            "base64": base64_image,
                            "seed": f'{seed1}',
                            "tags": to_image_create_prompt,
                            "keep_gallery": f'{keep_gallery}',
                            "final_infos": ''.join(final_infos)
                            })
            send_websocket_message(message=packed_json,
                                    websocket_address='127.0.0.1',
                                    websocket_port=WSPORT
                                    )
            keep_gallery = True
        else:
            break              

    return js_ret
    
def create_with_last_prompt(view_angle, view_camera, view_background, view_style, random_seed,  custom_prompt, keep_gallery,
                            ai_interface, ai_prompt, batch_generate_rule, prompt_ban, remote_ai_base_url, remote_ai_model, remote_ai_timeout,
                            ai_local_addr, ai_local_temp, ai_local_n_predict, ai_system_prompt_text,
                            api_interface, api_preview_refresh_time, api_addr, api_prompt, api_neg_prompt, api_image_data, api_image_landscape,  
                            api_model_sampler, api_model_scheduler, api_model_file_select,
                            api_hf_enable, api_hf_scale, api_hf_denoise, api_hf_upscaler_selected, api_hf_colortransfer, api_webui_savepath_override, api_hf_random_seed,
                            api_refiner_enable, api_refiner_add_noise, api_refiner_model_list, api_refiner_ratio
            ) -> tuple[str, str, Image.Image, Image.Image]:        
    global LANG
    global skip_next_generate
            
    cfg, steps, width, height, loops = parse_api_image_data(api_image_data, api_image_landscape)
    if '' != custom_prompt and not custom_prompt.endswith(','):
        custom_prompt = f'{custom_prompt},'
            
    final_infos = []
    
    ai_text=''
    if 'none' != batch_generate_rule:         
        ai_text = last_ai_text        
        if 'Last' != batch_generate_rule:            
            LANG["ai_system_prompt"] = textwrap.dedent(ai_system_prompt_text)
            if 'Remote' == ai_interface:
                ai_text = llm_send_request(ai_prompt, remote_ai_base_url, remote_ai_model, remote_ai_timeout)
            elif 'Local' == ai_interface:
                ai_text = llm_send_local_request(ai_prompt, ai_local_addr, ai_local_temp, ai_local_n_predict)                
    
    skip_next_generate = False
    js_ret = ""
    for index in range(1, loops + 1):
        if skip_next_generate:
            skip_next_generate = False
            break
        
        gr.Info(LANG["gr_info_create_n"].format(index, loops))
        seed = random_seed
        if random_seed == -1:
            seed = random.randint(0, 4294967295)        
            
        if 1 != index and 'Every' == batch_generate_rule:
            if 'Remote' == ai_interface:
                ai_text = llm_send_request(ai_prompt, remote_ai_base_url, remote_ai_model, remote_ai_timeout)
            elif 'Local' == ai_interface:
                ai_text = llm_send_local_request(ai_prompt, ai_local_addr, ai_local_temp, ai_local_n_predict)                
        
        tag_angle, tag_camera, tag_background, tag_style = create_view_tags(view_angle, view_camera, view_background, view_style, seed)
        to_image_create_prompt = f'{custom_prompt}{tag_angle}{tag_camera}{tag_background}{tag_style}{last_prompt}{ai_text}{api_prompt}'
        for ban_word in prompt_ban.split(','):
            to_image_create_prompt = to_image_create_prompt.replace(ban_word.strip(), '')
        
        final_info = f'{index}:\nCustom Promot:[{custom_prompt}]\nTags:[{tag_angle}{tag_camera}{tag_background}{tag_style}]\n{last_info}\nAI Prompt:[{ai_text}]'
        api_image, js_ret = create_image(api_interface, api_preview_refresh_time, api_addr, api_model_sampler, api_model_scheduler, api_model_file_select, to_image_create_prompt, api_neg_prompt, 
                                 seed, cfg, steps, width, height, 
                                 api_hf_enable, api_hf_scale, api_hf_denoise, api_hf_upscaler_selected, api_hf_colortransfer, api_webui_savepath_override, api_hf_random_seed,
                                 api_refiner_enable, api_refiner_add_noise, api_refiner_model_list, api_refiner_ratio
                                 )
        final_info = f'{final_info}\nSeed {index}:[{seed}]\n\n'
        final_infos.append(final_info)
        
        if api_image:            
            base64_image = set_custom_gallery_image(api_image)
            packed_json = json.dumps({
                            "command": "final_image",
                            "base64": base64_image,
                            "seed": f'{seed}',
                            "tags": to_image_create_prompt,
                            "keep_gallery": f'{keep_gallery}',
                            "final_infos": ''.join(final_infos)
                            })
            send_websocket_message(message=packed_json,
                                    websocket_address='127.0.0.1',
                                    websocket_port=WSPORT
                                    )
            keep_gallery = True
        else:
            break              
        
    return js_ret

def skip_next_generate_click():
    global skip_next_generate
    skip_next_generate = True
    gr.Warning(LANG["gr_info_skip_next_generate"])

def cancel_current_generate_click(api_addr, interface):
    global cancel_current_generate
    global skip_next_generate
    if 'ComfyUI' == interface:
        skip_next_generate = True
        cancel_current_generate = True
        cancel_comfyui(api_addr)
        gr.Warning(LANG["gr_info_skip_next_generate"])
    elif 'WebUI' == interface:
        skip_next_generate = True
        cancel_current_generate = True
        cancel_Webui(api_addr)
        gr.Warning(LANG["gr_info_skip_next_generate"])

def save_current_setting(character1, character2, character3, tag_assist,
                        view_angle, view_camera, view_background, view_style, api_model_sampler, api_model_scheduler, api_model_file_select, random_seed,
                        custom_prompt, api_prompt, api_neg_prompt, api_image_data, api_image_landscape, keep_gallery,
                        ai_prompt, batch_generate_rule, prompt_ban, ai_interface, 
                        remote_ai_base_url, remote_ai_model, remote_ai_timeout,
                        ai_local_addr, ai_local_temp, ai_local_n_predict, api_interface, api_preview_refresh_time, api_addr,
                        api_hf_enable, api_hf_scale, api_hf_denoise, api_hf_upscaler_selected, api_hf_colortransfer, api_webui_savepath_override, api_hf_random_seed,
                        api_refiner_enable, api_refiner_add_noise, api_refiner_model_list, api_refiner_ratio
                        ):        
    now_settings_json = {        
        "remote_ai_base_url": remote_ai_base_url,
        "remote_ai_model": remote_ai_model,
        "remote_ai_api_key": settings_json["remote_ai_api_key"],
        "remote_ai_timeout":remote_ai_timeout,
        
        "model_path": settings_json["model_path"],
        "model_filter": settings_json["model_filter"],
        "model_filter_keyword": settings_json["model_filter_keyword"],
        "search_modelinsubfolder": settings_json["search_modelinsubfolder"],
        
        "character1": character1,
        "character2": character2,
        "character3": character3,
        "tag_assist": tag_assist,
        
        "view_angle": view_angle,
        "view_camera": view_camera,
        "view_background": view_background,
        "view_style": view_style, 
        
        "api_model_sampler" : api_model_sampler, 
        "api_model_scheduler" : api_model_scheduler,
        "api_model_file_select" : api_model_file_select,
        "random_seed": random_seed,
        
        "custom_prompt": custom_prompt,
        "api_prompt": api_prompt,
        "api_neg_prompt": api_neg_prompt,
        "api_image_data": api_image_data,   
        "api_image_landscape": api_image_landscape,   
        "keep_gallery": keep_gallery,

        "batch_generate_rule": batch_generate_rule,
        "ai_prompt" : ai_prompt,                
        "prompt_ban": prompt_ban,
               
        "ai_interface": ai_interface,
        "ai_local_addr": ai_local_addr,
        "ai_local_temp": ai_local_temp,
        "ai_local_n_predict": ai_local_n_predict,
        
        "api_interface": api_interface,
        "api_preview_refresh_time": api_preview_refresh_time,
        "api_addr": api_addr,
        
        "api_hf_enable": api_hf_enable,
        "api_hf_scale": api_hf_scale,
        "api_hf_denoise": api_hf_denoise,
        "api_hf_upscaler_list": settings_json["api_hf_upscaler_list"],
        "api_hf_upscaler_selected": api_hf_upscaler_selected,
        "api_hf_colortransfer": api_hf_colortransfer,
        "api_webui_savepath_override": api_webui_savepath_override,
        "api_hf_random_seed": api_hf_random_seed,
        
        "api_refiner_enable": api_refiner_enable,
        "api_refiner_add_noise": api_refiner_add_noise,
        "api_refiner_model": api_refiner_model_list,
        "api_refiner_ratio": api_refiner_ratio,
    }
    
    tmp_file = save_json(now_settings_json=now_settings_json, file_name='tmp_settings.json')
    gr.Info(LANG["gr_info_settings_saved"].format(tmp_file))
    
def load_saved_setting(file_path):
    temp_settings_json = {}                
    with open(file_path, 'r', encoding='utf-8') as file:
        temp_settings_json.update(json.load(file))    
    load_settings(temp_settings_json)        
    gr.Info(LANG["gr_info_settings_loaded"].format(file_path))
    
    update_lora_list(settings_json["api_interface"], no_dropdown=True)
            
    return settings_json["character1"],settings_json["character2"],settings_json["character3"],settings_json["tag_assist"],\
            settings_json["view_angle"],settings_json["view_camera"],settings_json["view_background"], settings_json["view_style"],\
            settings_json["api_model_file_select"],settings_json["random_seed"],\
            settings_json["custom_prompt"],settings_json["api_prompt"],settings_json["api_neg_prompt"],settings_json["api_image_data"],settings_json["api_image_landscape"],settings_json["keep_gallery"],\
            settings_json["ai_prompt"],settings_json["batch_generate_rule"],settings_json["prompt_ban"],settings_json["ai_interface"],\
            settings_json["remote_ai_base_url"],settings_json["remote_ai_model"],settings_json["remote_ai_timeout"],\
            settings_json["ai_local_addr"],settings_json["ai_local_temp"],settings_json["ai_local_n_predict"],settings_json["api_interface"],settings_json["api_preview_refresh_time"], settings_json["api_addr"],\
            settings_json["api_hf_enable"],settings_json["api_hf_scale"],settings_json["api_hf_denoise"],settings_json["api_hf_upscaler_selected"],settings_json["api_hf_colortransfer"],settings_json["api_webui_savepath_override"],settings_json["api_hf_random_seed"],\
            settings_json["api_refiner_enable"],settings_json["api_refiner_add_noise"],settings_json["api_refiner_model"],settings_json["api_refiner_ratio"]

def update_sampler_and_scheduler_no_return():
    if not SAMPLER.__contains__(settings_json["api_model_sampler"]):
        settings_json["api_model_sampler"] = SAMPLER[0]
    
    if not SCHEDULER.__contains__(settings_json["api_model_scheduler"]):
        settings_json["api_model_scheduler"] = SCHEDULER[0]

def update_sampler_and_scheduler():
    update_sampler_and_scheduler_no_return()
        
    return gr.Dropdown(choices=SAMPLER, label=LANG["api_model_sampler"], value=settings_json["api_model_sampler"], allow_custom_value=False, scale=2),\
            gr.Dropdown(choices=SCHEDULER, label=LANG["api_model_scheduler"], value=settings_json["api_model_scheduler"], allow_custom_value=False, scale=1)

def batch_generate_rule_change(options_selected):
    print(f'[{CAT}]AI rule for Batch generate:{options_selected}')

def refresh_character_thumb_image_overlay(character):
    if 'none' == character or 'random' == character:
        return {"data": None, "error": "success"}
    
    _, _, thumb_image, _ = illustrious_character_select_ex(character = character)
    return set_custom_gallery_thumb_images([thumb_image])

def refresh_character_thumb_image(character1, character2, character3):
    thumb_image = []
    rnd_character = [''] * 3
    opt_chara = [''] * 3
        
    if 'none' != character1 and 'random' != character1:
        rnd_character[0], opt_chara[0], thumb_image1, _ = illustrious_character_select_ex(character = character1, random_action_seed=42)        
        thumb_image.append(thumb_image1)
    
    if 'none' != character2 and 'random' != character2:
        rnd_character[1], opt_chara[1], thumb_image2, _ = illustrious_character_select_ex(character = character2, random_action_seed=42)        
        thumb_image.append(thumb_image2)
        
    if 'none' != character3 and 'random' != character3:
        rnd_character[2], opt_chara[2], thumb_image3, _ = illustrious_character_select_ex(character = character3, random_action_seed=42)                
        thumb_image.append(thumb_image3)

    _, character_info = create_prompt_info(rnd_character[0], opt_chara[0], '',
                                    rnd_character[1], opt_chara[1], '',
                                    rnd_character[2], opt_chara[2], '',
                                    '', '')   
    
    js_generated_thumb_image_list = set_custom_gallery_thumb_images(thumb_image)
    return character_info, js_generated_thumb_image_list

def update_lora_list(api_interface, no_dropdown=False):
    global SAMPLER
    global SCHEDULER
    
    settings_json['api_interface'] = api_interface
    
    lora_file_dir = get_lora_path(os.path.dirname(settings_json['model_path']))
    lora_file_list = []
    
    if 'none' != settings_json['api_interface']:        
        if os.path.exists(lora_file_dir):
            lora_file_list = get_safetensors_files(lora_file_dir, settings_json['search_modelinsubfolder'])
        else:
            print(f'[{CAT}]LoRA path not exist {lora_file_dir}, there is a \"model_path_2nd\" in settings.json(if not click save settings), if you using WebUI and ComfyUI in same time, set it to another checkpoints folder.')
            lora_file_dir = get_lora_path(os.path.dirname(settings_json['model_path_2nd']))
                
            if os.path.exists(lora_file_dir):
                print(f'[{CAT}]Found LoRA in 2nd folder setting: {lora_file_dir}.')
                lora_file_list = get_safetensors_files(lora_file_dir, settings_json['search_modelinsubfolder'])
            else:
                print(f'[{CAT}]2nd LoRA path not exist {lora_file_dir}.')
        
        if 'WebUI' == api_interface:
            SAMPLER = SAMPLER_WEBUI
            SCHEDULER = SCHEDULER_WEBUI
        elif 'ComfyUI' == api_interface:
            SAMPLER = SAMPLER_COMFYUI
            SCHEDULER = SCHEDULER_COMFYUI
            
        update_sampler_and_scheduler_no_return()
    
    lora_file_list.insert(0, 'none')        
    interface_text = settings_json['api_interface']
    print(f'[{CAT}]LoRA list update to {interface_text}, LoRA count: {len(lora_file_list)}')
    
    if no_dropdown:
        return lora_file_list
    
    return gr.Dropdown(choices=lora_file_list, label='', value='none', allow_custom_value=False, scale=12)

def get_lora_path(api_parent_dir):
    lora_path = 'none'
    if 'WebUI' == settings_json['api_interface']:
        lora_path = os.path.join(api_parent_dir, 'lora')
    elif 'ComfyUI' == settings_json['api_interface']:
        lora_path = os.path.join(api_parent_dir, 'loras')
        
    return lora_path

def get_lora_info(lora_name):
    lora_file_dir = get_lora_path(os.path.dirname(settings_json['model_path']))
    lora_full_path = os.path.join(lora_file_dir, lora_name)
    if not os.path.exists(lora_full_path):
        print(f'[{CAT}]LoRA path not exist {lora_full_path}, try 2nd folder setting.')
        lora_file_dir = get_lora_path(os.path.dirname(settings_json['model_path_2nd']))
        lora_full_path = os.path.join(lora_file_dir, lora_name)
        
    final_str = f'LoRA {lora_full_path} not exist'
    base64_str = 'none'
    if os.path.exists(lora_full_path):        
        lora_thumb_path = lora_full_path.replace('.safetensors', '.png')
        if os.path.exists(lora_thumb_path):            
            with open(lora_thumb_path, "rb") as f:
                img_data = f.read()
                img_base64 = base64.b64encode(img_data).decode("utf-8")
                base64_str = f"data:image/png;base64,{img_base64}" 
                
        reader = SafetensorsMetadataReader(lora_full_path)
        compact_str = reader.to_compact_string()
        
        final_str = f'{lora_name}\n\n{LANG["lora_no_metadata"]}'
        if '{}' != compact_str:        
            key_map = {"modelspec.title": "Model Title", "modelspec.architecture": "Architecture","modelspec.date":"Date", "ss_sd_model_name": "Base Model Name","ss_base_model_version": "Base Model Version", "modelspec.resolution": "Resolution", "ss_seed": "Seed", "ss_clip_skip": "Clip Skip", "ss_network_dim": "Network Dim", "ss_network_alpha": "Network Alpha"}
            formatted_str = reader.extract_and_format(key_map)    
            top_tags_str = reader.extract_top_tags(top_n=10)
            trigger_words_str=''
            if ''!= top_tags_str:
                trigger_words_str = f'[COPY_CUSTOM=lime]{top_tags_str}[/COPY_CUSTOM]'
            final_str = f'{lora_name}\n\n{LANG["lora_info"]}\n{formatted_str}\n\n{LANG["lora_trigger_words"]}{trigger_words_str}\n\n{LANG["lora_metadata"]}\n{compact_str}'
            
    return base64_str, final_str

def add_lora(lora_list, api_prompt, api_interface):
    lora = ''
    if 'WebUI' == api_interface:
        pattern = r'([^/\\]+?)(?=\.safetensors$)'
        match = re.search(pattern, lora_list, re.IGNORECASE)
        if match:
            lora = f'\n<lora:{match.group(1)}:1>'
    elif 'ComfyUI' == api_interface:
        lora = f'\n<lora:{lora_list}:1>'
            
    return f'{api_prompt}{lora}'

def warning_lora(api):
    info = 'none'
    if 'ComfyUI' == api:
        info = LANG['api_warning_lora']
    return info

def parse_arguments():
    parser = argparse.ArgumentParser(description='Character Select Application')
    parser.add_argument("--english", type=bool, default=False, required=False, help='Use English Character Name')
    args = parser.parse_args()

    return args.english

def get_prompt_manager():
    return PROMPT_MANAGER

def init(ws_port):
    global ENGLISH_CHARACTER_NAME
    global LANG
    global WSPORT
    
    WSPORT = ws_port
    ENGLISH_CHARACTER_NAME = parse_arguments()
    if ENGLISH_CHARACTER_NAME:
        print(f'[{CAT}]:Use tags as Character Name')
        LANG = LANG_EN
    
    try:
        lib_js_path = os.path.join(current_dir, 'lib.js')
        lib_css_path = os.path.join(current_dir, 'lib.css')
        
        print('Load jsons...')
        load_jsons()
        print('Load js_script...')
        js_script = load_text_file(lib_js_path)
        print('Load css_script...')
        css_script = load_text_file(lib_css_path)
        print('Load init_custom_com...')
        status_wait, status_error = init_custom_com()                

        first_setup()
        lora_file_list = update_lora_list(settings_json['api_interface'], no_dropdown=True)        
    except Exception as e:
        print(f"[{CAT}]:Initialization failed: {e}")
        sys.exit(1)
        
    print(f'[{CAT}]:Starting...')
    return character_list, character_list_values, view_tags, original_character_list, model_files_list, refiner_model_files_list, lora_file_list,\
            LANG, js_script, css_script, status_wait, status_error, SAMPLER, SCHEDULER
