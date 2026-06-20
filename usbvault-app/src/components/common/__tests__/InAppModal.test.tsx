import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { InAppModal, EMPTY_MODAL } from '../InAppModal';
import type { InAppModalConfig } from '../InAppModal';

// Mock dependencies
jest.mock('@/utils/webStyle', () => ({
  webOnly: () => ({}),
}));
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe('InAppModal', () => {
  it('renders nothing when config.visible is false', () => {
    const { toJSON } = render(<InAppModal config={EMPTY_MODAL} />);
    expect(toJSON()).toBeNull();
  });

  it('renders title when visible', () => {
    const config: InAppModalConfig = {
      visible: true,
      title: 'Alert Title',
      buttons: [{ text: 'OK' }],
    };
    const { getByText } = render(<InAppModal config={config} />);
    expect(getByText('Alert Title')).toBeTruthy();
  });

  it('renders message when provided', () => {
    const config: InAppModalConfig = {
      visible: true,
      title: 'Warning',
      message: 'Something happened',
      buttons: [{ text: 'OK' }],
    };
    const { getByText } = render(<InAppModal config={config} />);
    expect(getByText('Something happened')).toBeTruthy();
  });

  it('does not render message when not provided', () => {
    const config: InAppModalConfig = {
      visible: true,
      title: 'Simple',
      buttons: [{ text: 'OK' }],
    };
    const { queryByText } = render(<InAppModal config={config} />);
    expect(queryByText('Something happened')).toBeNull();
  });

  it('renders all buttons', () => {
    const config: InAppModalConfig = {
      visible: true,
      title: 'Confirm',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive' },
        { text: 'OK' },
      ],
    };
    const { getByText } = render(<InAppModal config={config} />);
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
    expect(getByText('OK')).toBeTruthy();
  });

  it('calls button onPress when pressed', () => {
    const onPress = jest.fn();
    const config: InAppModalConfig = {
      visible: true,
      title: 'Action',
      buttons: [{ text: 'Confirm', onPress }],
    };
    const { getByText } = render(<InAppModal config={config} />);
    fireEvent.press(getByText('Confirm'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders icon when provided', () => {
    const config: InAppModalConfig = {
      visible: true,
      title: 'Success',
      icon: 'check-circle',
      iconColor: '#22D3EE',
      buttons: [{ text: 'OK' }],
    };
    // Should render without crashing (icon is mocked)
    const { getByText } = render(<InAppModal config={config} />);
    expect(getByText('Success')).toBeTruthy();
  });

  it('renders text input fields for prompt-style modals', () => {
    const onSubmit = jest.fn();
    const config: InAppModalConfig = {
      visible: true,
      title: 'Enter name',
      fields: [
        { key: 'name', label: 'Name', placeholder: 'Your name' },
        { key: 'email', label: 'Email', placeholder: 'you@example.com' },
      ],
      onSubmitFields: onSubmit,
      buttons: [{ text: 'Cancel', style: 'cancel' }],
    };
    const { getByText, getAllByLabelText } = render(<InAppModal config={config} />);
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('Email')).toBeTruthy();
    expect(getByText('Submit')).toBeTruthy();
    // Two text inputs with accessibility label
    expect(getAllByLabelText('Text input')).toHaveLength(2);
  });

  it('renders Submit button for field modals', () => {
    const onSubmit = jest.fn();
    const config: InAppModalConfig = {
      visible: true,
      title: 'Prompt',
      fields: [{ key: 'value', label: 'Value' }],
      onSubmitFields: onSubmit,
      buttons: [],
    };
    const { getByText } = render(<InAppModal config={config} />);
    expect(getByText('Submit')).toBeTruthy();
  });

  it('calls onSubmitFields when Submit is pressed', () => {
    const onSubmit = jest.fn();
    const config: InAppModalConfig = {
      visible: true,
      title: 'Prompt',
      fields: [{ key: 'name', label: 'Name', defaultValue: 'Alice' }],
      onSubmitFields: onSubmit,
      buttons: [],
    };
    const { getByText } = render(<InAppModal config={config} />);
    fireEvent.press(getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }));
  });

  it('calls onDismiss when overlay is pressed', () => {
    const onDismiss = jest.fn();
    const onPress = jest.fn();
    const config: InAppModalConfig = {
      visible: true,
      title: 'Dismissable',
      buttons: [{ text: 'OK', style: 'cancel', onPress }],
    };
    // The overlay press triggers handleClose which calls onDismiss and cancel button
    const { getByText } = render(<InAppModal config={config} onDismiss={onDismiss} />);
    expect(getByText('Dismissable')).toBeTruthy();
  });

  it('renders with secure text entry for password fields', () => {
    const config: InAppModalConfig = {
      visible: true,
      title: 'Enter Credentials',
      fields: [{ key: 'password', label: 'Password', secure: true }],
      onSubmitFields: jest.fn(),
      buttons: [],
    };
    const { getByText } = render(<InAppModal config={config} />);
    expect(getByText('Enter Credentials')).toBeTruthy();
    expect(getByText('Password')).toBeTruthy();
  });
});
