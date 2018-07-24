import firebase from 'firebase';
const config = {
  apiKey: "AIzaSyB8x5WHsTP7DMoaqo5KDJ0KmZkFWub68s4",
  authDomain: "upframeconnect.firebaseapp.com",
  databaseURL: "https://upframeconnect.firebaseio.com",
  projectId: "upframeconnect",
  storageBucket: "upframeconnect.appspot.com",
  messagingSenderId: "673573936602"
};

firebase.initializeApp(config)

export default firebase;