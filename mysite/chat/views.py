from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login as auth_login
from django.contrib.auth import get_user_model

User = get_user_model()  # Use the custom user model

from django.http import HttpResponse, HttpResponseBadRequest
from .models import Meeting
import random
import string
from bson import ObjectId

# Create your views here.
def main(request):
    # context= {}

    return render(request, 'chat/main.html')

# Login view
def login(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        print(f"Attempting to log in user: {username}")  # Debugging line
        user = authenticate(request, username=username, password=password)
        if user is not None:
            print(f"User {username} authenticated successfully.")  # Debugging line
            auth_login(request, user)
            return redirect('dashboard')
        else:
            print(f"Authentication failed for user: {username}")  # Debugging line
            return render(request, 'chat/login.html', {'error': 'Invalid username or password'})
    return render(request, 'chat/login.html')

# Register view
def register(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        email = request.POST['email']
        user = User.objects.create_user(username=username, password=password, email=email)
        user.save()
        return redirect('login')
    return render(request, 'chat/register.html')

# Dashboard view
def dashboard(request):
    return render(request, 'chat/dashboard.html')

# New meeting view
def new_meet(request):
    if request.method == 'POST':
        title = request.POST['title']
        description = request.POST['description']
        meeting_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        meeting = Meeting.objects.create(id=str(ObjectId()), title=title, description=description, code=meeting_code)
        return render(request, 'chat/new_meet.html', {'meeting_code': meeting_code, 'meeting_id': meeting.id})
    return render(request, 'chat/new_meet.html')

# Join meeting view
def join_meet(request):
    if request.method == 'POST':
        meeting_code = request.POST.get('meeting_code')
        if not meeting_code:
            return render(request, 'chat/join_meet.html', {'error': 'Meeting Code is required'})
        try:
            meeting = Meeting.objects.get(code=meeting_code)
            return redirect('meeting_page', room_name=meeting.id)
        except Meeting.DoesNotExist:
            return render(request, 'chat/join_meet.html', {'error': 'Meeting not found'})
    return render(request, 'chat/join_meet.html')

# Meeting page view
def meeting_page(request, room_name):
    if not room_name or not ObjectId.is_valid(room_name):
        return HttpResponseBadRequest("Invalid meeting ID")
    try:
        meeting = Meeting.objects.get(id=room_name)
        participants = User.objects.filter(meeting=meeting)  # Assuming a relationship exists
        return render(request, 'chat/meeting_page.html', {'meeting': meeting, 'participants': participants})
    except Meeting.DoesNotExist:
        return render(request, 'chat/meeting_page.html', {'error': 'Meeting not found'})

# Personal info view
def personal_info(request):
    if request.method == 'POST':
        user = request.user
        user.email = request.POST['email']
        user.save()
        return redirect('personal_info')
    return render(request, 'chat/personal_info.html', {'user': request.user})
